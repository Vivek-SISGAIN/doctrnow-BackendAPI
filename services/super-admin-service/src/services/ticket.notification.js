/**
 * ticket.notification.js
 *
 * Fires IN_APP and PUSH notifications for support ticket lifecycle events.
 * All calls route through the API Gateway → notification-service.
 *
 * Events:
 *  - TICKET_CREATED     → notify all SUPER_ADMIN users
 *  - STATUS_UPDATED     → notify the ticket owner (user)
 *  - REPLY_FROM_ADMIN   → notify the ticket owner (user)
 *  - REPLY_FROM_USER    → notify all SUPER_ADMIN users
 */

import axios from "axios";
import { randomUUID } from "crypto";

const CHANNELS = ["IN_APP", "PUSH"];

function buildInternalHeaders() {
  const secret = process.env.INTERNAL_SERVICE_SECRET || "";
  return {
    "X-Correlation-ID": randomUUID(),
    "x-internal-secret": secret,
    "x-internal-service-key": secret,
    "Content-Type": "application/json",
  };
}

const GATEWAY = () => {
  const gw = process.env.API_GATEWAY;
  if (!gw) throw new Error("[TicketNotification] API_GATEWAY env var is not set");
  return gw;
};

/**
 * Post a single notification for one userId via the gateway.
 */
async function sendSingle({ userId, title, body, payload }) {
  try {
    await axios.post(
      `${GATEWAY()}/notifications/single`,
      { userId, channels: CHANNELS, title, body, payload },
      { headers: buildInternalHeaders(), timeout: 5000 }
    );
  } catch (err) {
    console.warn("[TicketNotification] sendSingle failed:", err?.message);
  }
}

/**
 * Broadcast to all SUPER_ADMIN users via the gateway.
 */
async function broadcastToAdmins({ title, body, payload }) {
  try {
    await axios.post(
      `${GATEWAY()}/notifications/broadcast`,
      { roles: ["SUPER_ADMIN"], channels: CHANNELS, title, body, payload },
      { headers: buildInternalHeaders(), timeout: 5000 }
    );
  } catch (err) {
    console.warn("[TicketNotification] broadcastToAdmins failed:", err?.message);
  }
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

/**
 * Called when a user creates a new ticket.
 * Notifies all Super Admins.
 */
export async function notifyTicketCreated({ ticket }) {
  await broadcastToAdmins({
    title: `New Support Ticket: ${ticket.category.replace(/_/g, " ")}`,
    body: `[${ticket.ticketCode}] ${ticket.subject}`,
    payload: {
      type: "SUPPORT_TICKET",
      event: "TICKET_CREATED",
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      route: `/support/tickets/${ticket.id}`,
    },
  });
}

/**
 * Called when admin or user updates ticket status.
 */
export async function notifyStatusUpdated({ ticket, newStatus, actorRole }) {
  const readableStatus = newStatus.replace(/_/g, " ");
  const isAdminAction = actorRole === "SUPER_ADMIN";

  // Always notify the user (confirmation for self-closure or update from admin)
  await sendSingle({
    userId: ticket.userId,
    title: isAdminAction ? `Ticket ${ticket.ticketCode} Updated` : `Ticket Closed Successfully`,
    body: isAdminAction
      ? `Your support ticket is now "${readableStatus}".`
      : `You have successfully closed ticket ${ticket.ticketCode}.`,
    payload: {
      type: "SUPPORT_TICKET",
      event: "STATUS_UPDATED",
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      newStatus,
      route: `/support/ticket`,
    },
  });

  // If user closed it, also notify the admins
  if (newStatus === "closed" && !isAdminAction) {
    await broadcastToAdmins({
      title: `Ticket Closed by User: ${ticket.ticketCode}`,
      body: `The user has closed their ticket: "${ticket.subject}".`,
      payload: {
        type: "SUPPORT_TICKET",
        event: "STATUS_UPDATED",
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        newStatus,
        route: `/support/tickets/${ticket.id}`,
      },
    });
  }
}

/**
 * Called when admin adds a reply.
 * Notifies the ticket owner (user).
 */
export async function notifyAdminReplied({ ticket }) {
  await sendSingle({
    userId: ticket.userId,
    title: `New Reply on ${ticket.ticketCode}`,
    body: `The support team has replied to your ticket: "${ticket.subject}".`,
    payload: {
      type: "SUPPORT_TICKET",
      event: "REPLY_FROM_ADMIN",
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      route: `/support/ticket`,
    },
  });
}

/**
 * Called when the user (patient/doctor) adds a reply.
 * Notifies all Super Admins AND provides a confirmation to the user.
 */
export async function notifyUserReplied({ ticket }) {
  // 1. Notify all Super Admins
  await broadcastToAdmins({
    title: `User replied on ${ticket.ticketCode}`,
    body: `New message on ticket: "${ticket.subject}".`,
    payload: {
      type: "SUPPORT_TICKET",
      event: "REPLY_FROM_USER",
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      route: `/support/tickets/${ticket.id}`,
    },
  });

  // 2. Provide confirmation notification to the user (as requested)
  await sendSingle({
    userId: ticket.userId,
    title: `Message Sent: ${ticket.ticketCode}`,
    body: `Your comment has been added to the ticket.`,
    payload: {
      type: "SUPPORT_TICKET",
      event: "REPLY_CONFIRMATION",
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      route: `/support/ticket`,
    },
  });
}
