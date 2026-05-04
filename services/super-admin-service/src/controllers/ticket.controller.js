/**
 * ticket.controller.js
 *
 * HTTP handlers for the support ticket endpoints.
 * User identity is injected by the API Gateway via headers:
 *   x-user-id   → the authenticated user's ID
 *   x-user-role → the authenticated user's role
 */

import ticketService from "../services/ticket.service.js";
import asyncHandler from "../utils/asyncHandler.js";

class TicketController {
  /**
   * POST /api/super-admins/tickets
   * Create a new support ticket.
   * Access: PATIENT, DOCTOR, HOSPITAL_ADMIN
   */
  createTicket = asyncHandler(async (req, res) => {
    const userId = req.headers["x-user-id"];
    const userRole = req.headers["x-user-role"];

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorised: x-user-id header missing" });
    }

    const { category, subject, description, priority } = req.body;

    if (!category || !subject || !description) {
      return res.status(400).json({
        success: false,
        message: "category, subject, and description are required",
      });
    }

    const ticket = await ticketService.createTicket({
      userId,
      userRole,
      category,
      subject,
      description,
      priority: priority || "Medium",
    });

    res.status(201).json({
      success: true,
      message: "Ticket created successfully",
      data: ticket,
    });
  });

  /**
   * GET /api/super-admins/tickets
   * List tickets with pagination and filters.
   * Access: PATIENT/DOCTOR → own tickets only | SUPER_ADMIN → all tickets
   */
  getTickets = asyncHandler(async (req, res) => {
    const userId = req.headers["x-user-id"];
    const role = req.headers["x-user-role"];

    const { status, category, priority, search, page = 1, limit = 20 } = req.query;

    const result = await ticketService.getTickets({
      userId,
      role,
      status,
      category,
      priority,
      search,
      page: Number(page),
      limit: Number(limit),
    });

    res.status(200).json({
      success: true,
      data: result.tickets,
      pagination: result.pagination,
    });
  });

  /**
   * GET /api/super-admins/tickets/stats
   * Return ticket stats (totals per status).
   * Access: all authenticated users
   */
  getStats = asyncHandler(async (req, res) => {
    const userId = req.headers["x-user-id"];
    const role = req.headers["x-user-role"];

    const stats = await ticketService.getStats({ userId, role });

    res.status(200).json({ success: true, data: stats });
  });

  /**
   * GET /api/super-admins/tickets/:id
   * Fetch full ticket with timeline.
   * Access: owner (user who created it) | SUPER_ADMIN
   */
  getTicketById = asyncHandler(async (req, res) => {
    const userId = req.headers["x-user-id"];
    const role = req.headers["x-user-role"];

    const ticket = await ticketService.getTicketById({
      ticketId: req.params.id,
      userId,
      role,
    });

    res.status(200).json({ success: true, data: ticket });
  });

  /**
   * PATCH /api/super-admins/tickets/:id/status
   * Update ticket status and/or priority.
   * Access: SUPER_ADMIN (any update) | Owner (can only change status to "closed")
   */
  updateTicketStatus = asyncHandler(async (req, res) => {
    const userId = req.headers["x-user-id"];
    const role = req.headers["x-user-role"];

    const { status, priority } = req.body;

    if (!status && !priority) {
      return res.status(400).json({ success: false, message: "status or priority is required" });
    }

    const ticket = await ticketService.updateTicketStatus({
      ticketId: req.params.id,
      userId,
      role,
      status,
      priority,
    });

    res.status(200).json({
      success: true,
      message: "Ticket updated successfully",
      data: ticket,
    });
  });

  /**
   * POST /api/super-admins/tickets/:id/reply
   * Add a reply/comment to the ticket timeline.
   * Access: ticket owner (user) | SUPER_ADMIN
   */
  addReply = asyncHandler(async (req, res) => {
    const actorId = req.headers["x-user-id"];
    const actorRole = req.headers["x-user-role"];

    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: "text is required" });
    }

    const ticket = await ticketService.addTimelineEntry({
      ticketId: req.params.id,
      actorId,
      actorRole,
      text: text.trim(),
    });

    res.status(201).json({
      success: true,
      message: "Reply added successfully",
      data: ticket,
    });
  });
}

export default new TicketController();
