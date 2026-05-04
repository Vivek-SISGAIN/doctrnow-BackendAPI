/**
 * ticket.routes.js
 *
 * Route prefix: /api/super-admins/tickets
 *
 * Endpoint summary:
 *   GET    /               → list tickets (filtered by role: own | all)
 *   POST   /               → create new ticket
 *   GET    /stats          → ticket count summary
 *   GET    /:id            → get single ticket with full timeline
 *   PATCH  /:id/status     → update status/priority (Admin | Owner can close)
 *   POST   /:id/reply      → add a timeline reply
 */

import { Router } from "express";
import ticketController from "../controllers/ticket.controller.js";

const router = Router();

router.get("/", ticketController.getTickets);
router.post("/", ticketController.createTicket);
router.get("/stats", ticketController.getStats);
router.get("/:id", ticketController.getTicketById);
router.patch("/:id/status", ticketController.updateTicketStatus);
router.post("/:id/reply", ticketController.addReply);

export default router;
