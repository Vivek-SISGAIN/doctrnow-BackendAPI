/**
 * ticket.service.js
 *
 * Core business logic for Support Tickets.
 *
 * KEY DESIGN:
 *  - All DB operations use Prisma (super_admin_db PostgreSQL).
 *  - After DB queries, user profiles are fetched via profile.integration.js
 *    (which routes through the API Gateway) and merged into the response.
 *  - Notification triggers delegate to ticket.notification.js.
 */

import prisma from "../prisma/client.js";
import { fetchUserProfile, fetchUserProfilesBatch } from "./profile.integration.js";
import {
  notifyTicketCreated,
  notifyStatusUpdated,
  notifyAdminReplied,
  notifyUserReplied,
} from "./ticket.notification.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate the next sequential ticket code: TK-001, TK-002, ...
 */
async function generateTicketCode() {
  const count = await prisma.supportTicket.count();
  const next = count + 1;
  return `TK-${String(next).padStart(3, "0")}`;
}

/**
 * Convert frontend category string (with spaces) to Prisma enum value (underscores).
 * "Booking Issue" → "Booking_Issue"
 */
function toCategoryEnum(cat) {
  return cat?.replace(/ /g, "_");
}

/**
 * Convert Prisma enum category back to display string.
 * "Booking_Issue" → "Booking Issue"
 */
function fromCategoryEnum(cat) {
  return cat?.replace(/_/g, " ");
}

/**
 * Map a raw Prisma ticket + its profile data to the final API shape.
 */
function formatTicket(ticket, profileMap = {}) {
  const profile = profileMap[ticket.userId] ?? null;

  return {
    id: ticket.id,
    ticketCode: ticket.ticketCode,
    category: fromCategoryEnum(ticket.category),
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    assignedToId: ticket.assignedToId ?? null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    // Aggregated user info — no extra API call required by frontend
    user: profile
      ? {
          userId: profile.userId,
          name: `${profile.firstName} ${profile.lastName}`.trim(),
          email: profile.email,
          phone: profile.phone,
          avatarUrl: profile.avatarUrl,
          role: ticket.userRole,
        }
      : {
          userId: ticket.userId,
          name: "Unknown User",
          email: "",
          phone: "",
          avatarUrl: null,
          role: ticket.userRole,
        },
    // Timeline entries — actor field tells frontend if it was user or admin
    timeline: (ticket.timeline ?? []).map((entry) => ({
      id: entry.id,
      text: entry.text,
      isPatient: entry.actor === "USER",
      isSystem: entry.isSystem,
      actor: entry.actor,
      userId: entry.userId,
      timestamp: entry.createdAt,
    })),
  };
}

// ─── Service Methods ──────────────────────────────────────────────────────────

class TicketService {
  /**
   * Create a new support ticket.
   * Fires a notification to all SUPER_ADMINs.
   *
   * @param {{ userId, userRole, category, priority, subject, description }} data
   */
  async createTicket(data) {
    const ticketCode = await generateTicketCode();

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketCode,
        userId: data.userId,
        userRole: data.userRole,
        category: toCategoryEnum(data.category),
        subject: data.subject,
        description: data.description,
        priority: data.priority || "Medium",
        status: "open",
        timeline: {
          create: {
            text: "Ticket submitted",
            actor: "USER",
            userId: data.userId,
            isSystem: true,
          },
        },
      },
      include: { timeline: { orderBy: { createdAt: "desc" } } },
    });

    // Fire notification async — do not await so we don't block the response
    notifyTicketCreated({ ticket }).catch(() => {});

    const profile = await fetchUserProfile(ticket.userId, ticket.userRole);
    const profileMap = profile ? { [ticket.userId]: profile } : {};
    return formatTicket(ticket, profileMap);
  }

  /**
   * List tickets.
   * - Users: only see their own tickets (filtered by userId).
   * - Admins: see all tickets (no userId filter).
   * Includes aggregated user profile for each ticket.
   *
   * @param {{ userId?, role, status?, category?, priority?, search?, page, limit }} opts
   */
  async getTickets({ userId, role, status, category, priority, search, page = 1, limit = 20 }) {
    const isAdmin = role === "SUPER_ADMIN";
    const skip = (page - 1) * limit;

    const where = {};

    // Non-admins can only see their own tickets
    if (!isAdmin && userId) {
      where.userId = userId;
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = toCategoryEnum(category);

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: "insensitive" } },
        { ticketCode: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          timeline: {
            orderBy: { createdAt: "desc" },
            take: 1, // Only the latest entry for list view (saves data)
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit, 10),
      }),
      prisma.supportTicket.count({ where }),
    ]);

    // Batch-fetch all user profiles in one go to reduce API Gateway round-trips
    const usersToFetch = tickets.map((t) => ({ userId: t.userId, role: t.userRole }));
    const profileMap = await fetchUserProfilesBatch(usersToFetch);

    return {
      tickets: tickets.map((t) => formatTicket(t, profileMap)),
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get full ticket details including entire timeline.
   * - Users can only fetch their own ticket.
   * - Admins can fetch any ticket.
   */
  async getTicketById({ ticketId, userId, role }) {
    const isAdmin = role === "SUPER_ADMIN";

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        timeline: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!ticket) {
      const err = new Error("Ticket not found");
      err.statusCode = 404;
      throw err;
    }

    // Access control: non-admins can only see their own tickets
    if (!isAdmin && ticket.userId !== userId) {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }

    const profile = await fetchUserProfile(ticket.userId, ticket.userRole);
    const profileMap = profile ? { [ticket.userId]: profile } : {};
    return formatTicket(ticket, profileMap);
  }

  /**
   * Update ticket status and/or priority. Admin only.
   * Adds a system timeline entry recording the change.
   * Fires a notification to the ticket owner.
   */
  async updateTicketStatus({ ticketId, userId, role, status, priority }) {
    const existing = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!existing) {
      const err = new Error("Ticket not found");
      err.statusCode = 404;
      throw err;
    }

    const isAdmin = role === "SUPER_ADMIN";

    // Non-admins can only CLOSE their own tickets
    if (!isAdmin) {
      if (existing.userId !== userId) {
        const err = new Error("Forbidden");
        err.statusCode = 403;
        throw err;
      }
      if (priority) {
        const err = new Error("Only admins can change ticket priority");
        err.statusCode = 403;
        throw err;
      }
      if (status && status !== "closed") {
        const err = new Error("Users can only change status to 'closed'");
        err.statusCode = 403;
        throw err;
      }
    }

    const systemEntries = [];
    const updateData = { updatedAt: new Date() };

    if (status && status !== existing.status) {
      updateData.status = status;
      
      let entryText = `Status changed to "${status.replace(/_/g, " ")}"`;
      if (status === "closed") {
        entryText = isAdmin ? "Ticket closed by admin" : "Ticket closed by user";
      }

      systemEntries.push({
        text: entryText,
        actor: isAdmin ? "ADMIN" : "USER",
        userId: userId,
        isSystem: true,
      });
    }

    if (priority && priority !== existing.priority) {
      updateData.priority = priority;
      systemEntries.push({
        text: `Priority changed to "${priority}"`,
        actor: "SYSTEM",
        userId: userId,
        isSystem: true,
      });
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        ...updateData,
        ...(systemEntries.length > 0
          ? { timeline: { createMany: { data: systemEntries } } }
          : {}),
      },
      include: { timeline: { orderBy: { createdAt: "desc" } } },
    });

    // Notify the ticket owner or admins depending on who closed it
    if (status) {
      notifyStatusUpdated({ ticket, newStatus: status, actorRole: role }).catch(() => {});
    }

    const profile = await fetchUserProfile(ticket.userId, ticket.userRole);
    const profileMap = profile ? { [ticket.userId]: profile } : {};
    return formatTicket(ticket, profileMap);
  }

  /**
   * Add a reply/comment to the ticket timeline.
   * - actor "USER": fires notification to admins.
   * - actor "ADMIN": fires notification to the user.
   */
  async addTimelineEntry({ ticketId, actorId, actorRole, text }) {
    const existing = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!existing) {
      const err = new Error("Ticket not found");
      err.statusCode = 404;
      throw err;
    }

    // Non-admins can only reply to their own tickets
    const isAdmin = actorRole === "SUPER_ADMIN";
    if (!isAdmin && existing.userId !== actorId) {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }

    // Cannot reply to resolved/closed tickets (unless admin)
    if (!isAdmin && (existing.status === "resolved" || existing.status === "closed")) {
      const err = new Error("Cannot reply to a resolved or closed ticket");
      err.statusCode = 400;
      throw err;
    }

    const actor = isAdmin ? "ADMIN" : "USER";

    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        updatedAt: new Date(),
        timeline: {
          create: { text, actor, userId: actorId, isSystem: false },
        },
      },
      include: { timeline: { orderBy: { createdAt: "desc" } } },
    });

    // Fire notifications
    if (isAdmin) {
      notifyAdminReplied({ ticket }).catch(() => {});
    } else {
      notifyUserReplied({ ticket }).catch(() => {});
    }

    const profile = await fetchUserProfile(ticket.userId, ticket.userRole);
    const profileMap = profile ? { [ticket.userId]: profile } : {};
    return formatTicket(ticket, profileMap);
  }

  /**
   * Get summary stats for the dashboard.
   * Admins see platform-wide; users see their own.
   */
  async getStats({ userId, role }) {
    const isAdmin = role === "SUPER_ADMIN";
    const base = isAdmin ? {} : { userId };

    const [total, open, inProgress, resolved, closed] = await Promise.all([
      prisma.supportTicket.count({ where: base }),
      prisma.supportTicket.count({ where: { ...base, status: "open" } }),
      prisma.supportTicket.count({ where: { ...base, status: "in_progress" } }),
      prisma.supportTicket.count({ where: { ...base, status: "resolved" } }),
      prisma.supportTicket.count({ where: { ...base, status: "closed" } }),
    ]);

    return { total, open, inProgress, resolved, closed };
  }
}

export default new TicketService();
