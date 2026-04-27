"use strict";

/**
 * Admin Chat Controller
 * ─────────────────────
 * Handles the Hospital Admin ↔ Super Admin support-chat lifecycle.
 *
 * This controller is ISOLATED from the patient-doctor chat flow.
 * It does NOT touch Conversation, Message, or ConsultationChatSession.
 *
 * Routes (all prefixed with /api/admin-chat):
 *   POST   /request          — hospital admin opens a support request
 *   GET    /requests         — super admin lists open/all requests
 *   POST   /requests/:id/accept   — super admin claims a request (race-safe)
 *   POST   /requests/:id/end      — either party ends the session
 *   GET    /session/:id      — fetch a single session (for polling / status)
 *   GET    /my-session       — hospital admin fetches their latest active/requested session
 */

const AdminChatSession = require("../models/adminChatSession.model");
const { getIO }        = require("../realtime/socket");
const logger           = require("../utils/logger");

const requireIdentity = (req, res) => {
    const userId = req.user?.userId;
    const role = req.user?.role;
    if (!userId || !role) {
        res.status(401).json({ success: false, error: "Missing identity headers" });
        return null;
    }
    return { userId, role };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Non-blocking socket emit — failure must NEVER break a REST response.
 * Emits to the "admin_support" room that all connected super-admins join.
 */
const emitAdminEvent = (event, payload) => {
    try {
        getIO().to("admin_support").emit(event, payload);
    } catch (err) {
        logger.warn(`[adminChat] socket emit failed: ${event}`, { error: err.message });
    }
};

/**
 * Emit to the personal room of a specific user (e.g. the hospital admin
 * whose session status just changed).
 */
const emitToUser = (userId, event, payload) => {
    try {
        getIO().to(`user:${userId}`).emit(event, payload);
    } catch (err) {
        logger.warn(`[adminChat] user socket emit failed: ${event}`, { userId, error: err.message });
    }
};

// ─── POST /api/admin-chat/request ────────────────────────────────────────────

/**
 * Hospital Admin creates a support-chat request.
 *
 * Body: { subject? }
 * Auth headers: x-user-id, x-user-role (must be HOSPITAL_ADMIN)
 */
const createRequest = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { userId, role } = identity;

        if (role !== "HOSPITAL_ADMIN") {
            return res.status(403).json({ success: false, error: "Only Hospital Admins can create chat requests" });
        }

        // Prevent duplicate open requests from the same admin
        const existing = await AdminChatSession.findOne({
            hospitalAdminId: userId,
            status: { $in: ["REQUESTED", "ACTIVE"] }
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                error: "You already have an open chat request",
                data: existing
            });
        }

        const { subject, hospitalAdminName, hospitalName } = req.body;

        const session = await AdminChatSession.create({
            hospitalAdminId:   userId,
            hospitalAdminName: hospitalAdminName || null,
            hospitalName:      hospitalName      || null,
            subject:           subject           || null,
            status:            "REQUESTED"
        });

        logger.info("[adminChat] Request created", { sessionId: session._id, hospitalAdminId: userId });

        // Broadcast to all connected super admins
        emitAdminEvent("admin_chat:new_request", {
            sessionId:         session._id,
            hospitalAdminId:   session.hospitalAdminId,
            hospitalAdminName: session.hospitalAdminName,
            hospitalName:      session.hospitalName,
            subject:           session.subject,
            createdAt:         session.createdAt
        });

        return res.status(201).json({ success: true, data: session });
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/admin-chat/requests ────────────────────────────────────────────

/**
 * Super Admin lists chat requests.
 * Query params:
 *   status  — "REQUESTED" | "ACTIVE" | "ENDED" | "all"  (default "REQUESTED")
 *   limit   — integer (default 50)
 */
const listRequests = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { role } = identity;

        if (role !== "SUPER_ADMIN") {
            return res.status(403).json({ success: false, error: "Only Super Admins can list chat requests" });
        }

        const statusParam = req.query.status || "REQUESTED";
        const limit       = Math.min(parseInt(req.query.limit, 10) || 50, 100);

        const filter = statusParam === "all" ? {} : { status: statusParam };

        const sessions = await AdminChatSession.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return res.status(200).json({ success: true, data: sessions });
    } catch (err) {
        next(err);
    }
};

// ─── POST /api/admin-chat/requests/:id/accept ────────────────────────────────

/**
 * Super Admin accepts a REQUESTED session.
 *
 * Uses findOneAndUpdate with status:"REQUESTED" as the atomic guard so only
 * one admin can claim a session even under concurrent requests (race-safe).
 *
 * Body: { superAdminName? }
 */
const acceptRequest = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { userId, role } = identity;

        if (role !== "SUPER_ADMIN") {
            return res.status(403).json({ success: false, error: "Only Super Admins can accept chat requests" });
        }

        const { id } = req.params;
        const { superAdminName } = req.body;

        // Atomic claim — only succeeds if the session is still REQUESTED
        const session = await AdminChatSession.findOneAndUpdate(
            { _id: id, status: "REQUESTED" },
            {
                $set: {
                    superAdminId:   userId,
                    superAdminName: superAdminName || null,
                    status:         "ACTIVE",
                    startedAt:      new Date()
                }
            },
            { new: true }
        );

        if (!session) {
            // Either not found, or already claimed by another super admin
            const check = await AdminChatSession.findById(id).lean();
            if (!check) {
                return res.status(404).json({ success: false, error: "Session not found" });
            }
            return res.status(409).json({
                success: false,
                error: "This request has already been accepted by another admin"
            });
        }

        logger.info("[adminChat] Session accepted", {
            sessionId: session._id,
            superAdminId: userId,
            hospitalAdminId: session.hospitalAdminId
        });

        // Notify the hospital admin that their request was accepted
        emitToUser(session.hospitalAdminId, "admin_chat:accepted", {
            sessionId:      session._id,
            superAdminId:   session.superAdminId,
            superAdminName: session.superAdminName,
            startedAt:      session.startedAt
        });

        // Update all super admin views — session is no longer "open"
        emitAdminEvent("admin_chat:request_accepted", {
            sessionId:    session._id,
            superAdminId: userId
        });

        return res.status(200).json({ success: true, data: session });
    } catch (err) {
        next(err);
    }
};

// ─── POST /api/admin-chat/requests/:id/end ───────────────────────────────────

/**
 * Either party (Hospital Admin or Super Admin) ends an ACTIVE session.
 * Records endedAt and transitions to ENDED.
 */
const endSession = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { userId } = identity;
        const { id }     = req.params;

        const session = await AdminChatSession.findById(id);

        if (!session) {
            return res.status(404).json({ success: false, error: "Session not found" });
        }

        // Only the two participants may end the session
        const isParticipant =
            session.hospitalAdminId === userId ||
            session.superAdminId    === userId;

        if (!isParticipant) {
            return res.status(403).json({ success: false, error: "You are not a participant of this session" });
        }

        if (session.status === "ENDED") {
            return res.status(200).json({ success: true, data: session }); // idempotent
        }

        session.status  = "ENDED";
        session.endedAt = new Date();
        await session.save();

        logger.info("[adminChat] Session ended", {
            sessionId:       session._id,
            endedBy:         userId,
            hospitalAdminId: session.hospitalAdminId,
            superAdminId:    session.superAdminId,
            startedAt:       session.startedAt,
            endedAt:         session.endedAt
        });

        // Notify both parties
        emitToUser(session.hospitalAdminId, "admin_chat:ended", {
            sessionId: session._id,
            endedAt:   session.endedAt
        });

        if (session.superAdminId) {
            emitToUser(session.superAdminId, "admin_chat:ended", {
                sessionId: session._id,
                endedAt:   session.endedAt
            });
        }

        emitAdminEvent("admin_chat:session_ended", { sessionId: session._id });

        return res.status(200).json({ success: true, data: session });
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/admin-chat/session/:id ─────────────────────────────────────────

/**
 * Fetch a single session by ID.
 * Accessible by either participant.
 */
const getSession = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { userId, role } = identity;
        const session = await AdminChatSession.findById(req.params.id).lean();

        if (!session) {
            return res.status(404).json({ success: false, error: "Session not found" });
        }

        const isParticipant =
            session.hospitalAdminId === userId ||
            session.superAdminId    === userId;

        // Super admins can view any session for audit purposes
        if (!isParticipant && role !== "SUPER_ADMIN") {
            return res.status(403).json({ success: false, error: "Access denied" });
        }

        return res.status(200).json({ success: true, data: session });
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/admin-chat/my-session ──────────────────────────────────────────

/**
 * Hospital Admin fetches their latest active or pending session.
 * Returns null data if none exists.
 */
const getMySession = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { userId } = identity;

        const session = await AdminChatSession.findOne({
            hospitalAdminId: userId,
            status: { $in: ["REQUESTED", "ACTIVE"] }
        })
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({ success: true, data: session || null });
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/admin-chat/audit-logs ──────────────────────────────────────────

/**
 * Super Admin retrieves completed session audit logs.
 * Supports optional filtering by hospitalAdminId or superAdminId.
 */
const getAuditLogs = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { role } = identity;

        if (role !== "SUPER_ADMIN") {
            return res.status(403).json({ success: false, error: "Only Super Admins can access audit logs" });
        }

        const { hospitalAdminId, superAdminId, limit = 50, page = 1 } = req.query;

        const filter = { status: "ENDED" };
        if (hospitalAdminId) filter.hospitalAdminId = hospitalAdminId;
        if (superAdminId)    filter.superAdminId    = superAdminId;

        const pageNum  = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(100, parseInt(limit, 10) || 50);
        const skip     = (pageNum - 1) * limitNum;

        const [logs, total] = await Promise.all([
            AdminChatSession.find(filter)
                .sort({ endedAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            AdminChatSession.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            data: logs,
            meta: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (err) {
        next(err);
    }
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    createRequest,
    listRequests,
    acceptRequest,
    endSession,
    getSession,
    getMySession,
    getAuditLogs
};
