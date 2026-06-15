"use strict";

/**
 * Admin Chat Controller
 * ─────────────────────
 * Handles the support-chat lifecycle between:
 *   - Hospital Admin ↔ Super Admin  (existing flow, unchanged)
 *   - Doctor        ↔ Super Admin  (new)
 *   - Patient       ↔ Super Admin  (new)
 *
 * This controller is ISOLATED from the patient-doctor chat flow.
 * It does NOT touch Conversation, Message, or ConsultationChatSession.
 *
 * Routes (all prefixed with /api/admin-chat):
 *   POST   /request                    — requester opens a support request
 *   GET    /requests                   — super admin lists open/all requests
 *   POST   /requests/:id/accept        — super admin claims a request (race-safe)
 *   POST   /requests/:id/end           — either party ends the session
 *   GET    /session/:id                — fetch a single session (for polling / status)
 *   GET    /my-session                 — requester fetches their latest active/requested session
 *   GET    /session/:id/messages       — fetch persisted messages
 *   POST   /session/:id/resolve        — super admin marks session resolved
 *   GET    /audit-logs                 — super admin retrieves ended sessions
 *   GET    /search                     — super admin searches sessions
 *   POST   /session/:id/upload         — upload file attachment
 */

const AdminChatSession = require("../models/adminChatSession.model");
const AdminChatMessage = require("../models/adminChatMessage.model");
const { getIO } = require("../realtime/socket");
const logger = require("../utils/logger");
const { triggerBroadcastNotification } = require("../service/notificationPublisher.service");

// Roles that may create a support-chat request
const ALLOWED_REQUESTER_ROLES = ["HOSPITAL_ADMIN", "DOCTOR", "PATIENT"];

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
        logger.warn(`[adminChat] socket emit failed: ${event}`, {
            error: err.message,
        });
    }
};

/**
 * Emit to the personal room of a specific user.
 */
const emitToUser = (userId, event, payload) => {
    try {
        getIO().to(`user:${userId}`).emit(event, payload);
    } catch (err) {
        logger.warn(`[adminChat] user socket emit failed: ${event}`, {
            userId,
            error: err.message,
        });
    }
};

/**
 * Build the requester identity filter based on role.
 * Used for duplicate-check and getMySession queries.
 */
const buildRequesterFilter = (role, userId) => {
    if (role === "HOSPITAL_ADMIN") return { hospitalAdminId: userId };
    if (role === "DOCTOR") return { doctorId: userId };
    if (role === "PATIENT") return { patientId: userId };
    return { hospitalAdminId: userId }; // fallback
};

/**
 * Build participant check — any of the four ID fields may match.
 */
const isSessionParticipant = (session, userId) =>
    session.hospitalAdminId === userId ||
    session.doctorId === userId ||
    session.patientId === userId ||
    session.superAdminId === userId;

// ─── POST /api/admin-chat/request ────────────────────────────────────────────

/**
 * Requester (Hospital Admin | Doctor | Patient) creates a support-chat request.
 *
 * Body: { subject?, hospitalAdminName?, hospitalName?, hospitalId?,
 *         requesterName?, doctorName?, patientName? }
 * Auth headers: x-user-id, x-user-role (injected by gateway from JWT)
 */
const createRequest = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { userId, role } = identity;

        if (!ALLOWED_REQUESTER_ROLES.includes(role)) {
            return res.status(403).json({
                success: false,
                error:
                    "Only Hospital Admins, Doctors, and Patients can create chat requests",
            });
        }

        // Prevent duplicate open requests from the same requester
        const requesterFilter = buildRequesterFilter(role, userId);
        const existing = await AdminChatSession.findOne({
            ...requesterFilter,
            status: { $in: ["REQUESTED", "ACTIVE"] },
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                error: "You already have an open support chat request",
                data: existing,
            });
        }

        const {
            subject,
            hospitalAdminName, // kept for backward compat (hospital admin flow)
            hospitalName,
            hospitalId,
            requesterName, // display name for doctor/patient
            doctorName, // alias for requesterName when role is DOCTOR
            patientName, // alias for requesterName when role is PATIENT
        } = req.body;

        // Resolve the display name from whatever field was sent
        const resolvedRequesterName =
            requesterName || doctorName || patientName || hospitalAdminName || null;

        // Build the session document
        const sessionData = {
            superAdminId: null,
            superAdminName: null,
            subject: subject || null,
            status: "REQUESTED",
            requesterRole: role,
            requesterName: resolvedRequesterName,
        };

        // Set role-specific ID and display fields
        if (role === "HOSPITAL_ADMIN") {
            sessionData.hospitalAdminId = userId;
            sessionData.hospitalAdminName = resolvedRequesterName; // backward compat
            sessionData.hospitalName = hospitalName || null;
            sessionData.hospitalId = hospitalId || null;
        } else if (role === "DOCTOR") {
            sessionData.doctorId = userId;
        } else if (role === "PATIENT") {
            sessionData.patientId = userId;
        }

        const session = await AdminChatSession.create(sessionData);

        logger.info("[adminChat] Request created", {
            sessionId: session._id,
            userId,
            role,
            requesterRole: session.requesterRole,
        });

        // Broadcast to all connected super admins — include new fields
        emitAdminEvent("admin_chat:new_request", {
            sessionId: session._id,
            hospitalAdminId: session.hospitalAdminId,
            hospitalAdminName: session.hospitalAdminName,
            hospitalName: session.hospitalName,
            doctorId: session.doctorId,
            patientId: session.patientId,
            requesterName: session.requesterName,
            requesterRole: session.requesterRole,
            subject: session.subject,
            createdAt: session.createdAt,
        });

        // Trigger push/in-app notification to all Super Admins
        triggerBroadcastNotification({
            roles: ["SUPER_ADMIN"],
            title: "New Support Request",
            body: `${session.requesterName || session.requesterRole} has requested support: ${session.subject || "No subject"}`,
            payload: {
                type: "NEW_SUPPORT_REQUEST",
                sessionId: session._id,
                requesterRole: session.requesterRole,
                requesterName: session.requesterName,
                subject: session.subject
            }
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
 *   status        — "REQUESTED" | "ACTIVE" | "ENDED" | "all"  (default "REQUESTED")
 *   limit         — integer (default 50)
 *   requesterRole — "HOSPITAL_ADMIN" | "DOCTOR" | "PATIENT" | "all"  (NEW)
 */
const listRequests = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { role } = identity;

        if (role !== "SUPER_ADMIN") {
            return res
                .status(403)
                .json({
                    success: false,
                    error: "Only Super Admins can list chat requests",
                });
        }

        const statusParam = req.query.status || "REQUESTED";
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const requesterRole = req.query.requesterRole; // NEW

        const filter = statusParam === "all" ? {} : { status: statusParam };

        // Filter by requester role if provided
        if (requesterRole && requesterRole !== "all") {
            if (requesterRole === "HOSPITAL_ADMIN") {
                // Old sessions have requesterRole: null — treat null as HOSPITAL_ADMIN
                filter.$or = [
                    { requesterRole: "HOSPITAL_ADMIN" },
                    { requesterRole: null },
                ];
            } else {
                filter.requesterRole = requesterRole;
            }
        }

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
            return res
                .status(403)
                .json({
                    success: false,
                    error: "Only Super Admins can accept chat requests",
                });
        }

        const { id } = req.params;
        const { superAdminName } = req.body;

        // Atomic claim — only succeeds if the session is still REQUESTED
        const session = await AdminChatSession.findOneAndUpdate(
            { _id: id, status: "REQUESTED" },
            {
                $set: {
                    superAdminId: userId,
                    superAdminName: superAdminName || null,
                    status: "ACTIVE",
                    startedAt: new Date(),
                },
            },
            { new: true },
        );

        if (!session) {
            // Either not found, or already claimed by another super admin
            const check = await AdminChatSession.findById(id).lean();
            if (!check) {
                return res
                    .status(404)
                    .json({ success: false, error: "Session not found" });
            }
            return res.status(409).json({
                success: false,
                error: "This request has already been accepted by another admin",
            });
        }

        logger.info("[adminChat] Session accepted", {
            sessionId: session._id,
            superAdminId: userId,
            requesterRole: session.requesterRole,
        });

        // Notify the requester (whichever role they are) that their request was accepted
        const requesterId =
            session.hospitalAdminId || session.doctorId || session.patientId;
        if (requesterId) {
            emitToUser(requesterId, "admin_chat:accepted", {
                sessionId: session._id,
                superAdminId: session.superAdminId,
                superAdminName: session.superAdminName,
                startedAt: session.startedAt,
            });
        }

        // Update all super admin views — session is no longer "open"
        emitAdminEvent("admin_chat:request_accepted", {
            sessionId: session._id,
            superAdminId: userId,
        });

        return res.status(200).json({ success: true, data: session });
    } catch (err) {
        next(err);
    }
};

// ─── POST /api/admin-chat/requests/:id/end ───────────────────────────────────

/**
 * Either party ends an ACTIVE session.
 * Records endedAt and transitions to ENDED.
 */
const endSession = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { userId } = identity;
        const { id } = req.params;

        const session = await AdminChatSession.findById(id);

        if (!session) {
            return res
                .status(404)
                .json({ success: false, error: "Session not found" });
        }

        // Only participants may end the session
        if (!isSessionParticipant(session, userId)) {
            return res
                .status(403)
                .json({
                    success: false,
                    error: "You are not a participant of this session",
                });
        }

        if (session.status === "ENDED") {
            return res.status(200).json({ success: true, data: session }); // idempotent
        }

        session.status = "ENDED";
        session.endedAt = new Date();
        await session.save();

        logger.info("[adminChat] Session ended", {
            sessionId: session._id,
            endedBy: userId,
            requesterRole: session.requesterRole,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
        });

        // Notify the requester (whichever role they are)
        const requesterId =
            session.hospitalAdminId || session.doctorId || session.patientId;
        if (requesterId) {
            emitToUser(requesterId, "admin_chat:ended", {
                sessionId: session._id,
                endedAt: session.endedAt,
            });
        }

        // Notify the super admin
        if (session.superAdminId) {
            emitToUser(session.superAdminId, "admin_chat:ended", {
                sessionId: session._id,
                endedAt: session.endedAt,
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
            return res
                .status(404)
                .json({ success: false, error: "Session not found" });
        }

        const isParticipant = isSessionParticipant(session, userId);

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
 * Requester fetches their latest active or pending session.
 * Role-aware: checks the correct ID field based on the caller's role.
 * Returns null data if none exists.
 */
const getMySession = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { userId, role } = identity;

        // Build the filter based on who is asking
        const requesterFilter = buildRequesterFilter(role, userId);

        const session = await AdminChatSession.findOne({
            ...requesterFilter,
            status: { $in: ["REQUESTED", "ACTIVE"] },
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
        const { role, userId } = identity;

        // Super Admin can see everything, others only their own
        const filter = { status: "ENDED" };

        if (role === "PATIENT") {
            filter.patientId = userId;
        } else if (role === "DOCTOR") {
            filter.doctorId = userId;
        } else if (role === "HOSPITAL_ADMIN") {
            filter.hospitalAdminId = userId;
        } else if (role !== "SUPER_ADMIN") {
            return res.status(403).json({ success: false, error: "Access denied" });
        }

        const { hospitalAdminId, superAdminId, limit = 50, page = 1 } = req.query;

        // If SA, they can filter further by specific users
        if (role === "SUPER_ADMIN") {
            if (hospitalAdminId) filter.hospitalAdminId = hospitalAdminId;
            if (superAdminId) filter.superAdminId = superAdminId;
            if (req.query.patientId) filter.patientId = req.query.patientId;
            if (req.query.doctorId) filter.doctorId = req.query.doctorId;
        }

        const [logs, total] = await Promise.all([
            AdminChatSession.find(filter)
                .sort({ endedAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            AdminChatSession.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: logs,
            meta: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/admin-chat/session/:id/messages ──────────────────────────────────
const getSessionMessages = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { userId, role } = identity;
        const { id } = req.params;
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
        const before = req.query.before;

        const session = await AdminChatSession.findById(id).lean();
        if (!session) {
            return res
                .status(404)
                .json({ success: false, error: "Session not found" });
        }

        const isParticipant = isSessionParticipant(session, userId);

        if (!isParticipant && role !== "SUPER_ADMIN") {
            return res.status(403).json({ success: false, error: "Access denied" });
        }

        const query = { sessionId: id };
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }

        const messages = await AdminChatMessage.find(query)
            .sort({ createdAt: 1 })
            .limit(limit)
            .lean();

        // Sign attachment URLs on-the-fly
        const { generatePresignedUrl } = require("../config/s3");
        for (const msg of messages) {
            if (msg.attachments && msg.attachments.length > 0) {
                for (const att of msg.attachments) {
                    if (att.key) {
                        const signedUrl = await generatePresignedUrl(att.key);
                        if (signedUrl) att.url = signedUrl;
                    }
                }
            }
        }

        return res.status(200).json({ success: true, data: messages });
    } catch (err) {
        next(err);
    }
};

// ─── POST /api/admin-chat/session/:id/resolve ────────────────────────────────
const markSessionResolved = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { role } = identity;

        if (role !== "SUPER_ADMIN") {
            return res
                .status(403)
                .json({
                    success: false,
                    error: "Only Super Admins can mark sessions resolved",
                });
        }

        const { id } = req.params;
        const session = await AdminChatSession.findByIdAndUpdate(
            id,
            { resolved: true },
            { new: true },
        );

        if (!session) {
            return res
                .status(404)
                .json({ success: false, error: "Session not found" });
        }

        return res.status(200).json({ success: true, data: session });
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/admin-chat/search ──────────────────────────────────────────────
const searchSessions = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { role } = identity;

        if (role !== "SUPER_ADMIN") {
            return res
                .status(403)
                .json({
                    success: false,
                    error: "Only Super Admins can search sessions",
                });
        }

        const {
            startDate,
            endDate,
            resolved,
            status,
            hospitalAdminId,
            page = 1,
            limit = 20,
        } = req.query;

        const filter = {};
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        if (resolved === "true") filter.resolved = true;
        if (resolved === "false") filter.resolved = false;
        if (status && status !== "all") filter.status = status;
        if (hospitalAdminId) filter.hospitalAdminId = hospitalAdminId;
        if (req.query.hospitalId) filter.hospitalId = req.query.hospitalId;
        if (req.query.hospitalName) {
            filter.hospitalName = { $regex: req.query.hospitalName, $options: "i" };
        }

        // NEW — filter by doctorId, patientId, requesterRole
        if (req.query.doctorId) filter.doctorId = req.query.doctorId;
        if (req.query.patientId) filter.patientId = req.query.patientId;
        if (req.query.requesterRole && req.query.requesterRole !== "all") {
            if (req.query.requesterRole === "HOSPITAL_ADMIN") {
                // Old sessions have requesterRole: null — treat null as HOSPITAL_ADMIN
                filter.$or = [
                    { requesterRole: "HOSPITAL_ADMIN" },
                    { requesterRole: null },
                ];
            } else {
                filter.requesterRole = req.query.requesterRole;
            }
        }

        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(100, parseInt(limit, 10));
        const skip = (pageNum - 1) * limitNum;

        const [sessions, total] = await Promise.all([
            AdminChatSession.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            AdminChatSession.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: sessions,
            meta: {
                total,
                page: pageNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        next(err);
    }
};

// ─── POST /api/admin-chat/session/:id/upload ─────────────────────────────────
/**
 * Upload a file attachment for an admin chat session.
 * Uses multer for multipart/form-data parsing.
 * Stores the file in memory and uploads to S3 (or a compatible store).
 * Returns the attachment metadata so the client can include it in the socket message.
 *
 * Accepted: images (jpeg, png, gif, webp) and documents (pdf, doc, docx, xls, xlsx, txt)
 * Max size: 10 MB
 */
const uploadAttachment = async (req, res, next) => {
    try {
        const identity = requireIdentity(req, res);
        if (!identity) return;
        const { userId, role } = identity;
        const { id: sessionId } = req.params;

        // Verify session exists and user is a participant
        const session = await AdminChatSession.findById(sessionId).lean();
        if (!session) {
            return res
                .status(404)
                .json({ success: false, error: "Session not found" });
        }

        const isParticipant = isSessionParticipant(session, userId);
        if (!isParticipant && role !== "SUPER_ADMIN") {
            return res.status(403).json({ success: false, error: "Access denied" });
        }

        // req.file is populated by the multer middleware (configured in routes)
        if (!req.file) {
            return res
                .status(400)
                .json({ success: false, error: "No file provided" });
        }

        const { originalname, mimetype, size, buffer } = req.file;

        // Validate size (10 MB max)
        const MAX_SIZE = 10 * 1024 * 1024;
        if (size > MAX_SIZE) {
            return res
                .status(413)
                .json({
                    success: false,
                    error: "File too large. Maximum size is 10 MB.",
                });
        }

        // Validate mime type
        const ALLOWED_TYPES = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
        ];
        if (!ALLOWED_TYPES.includes(mimetype)) {
            return res
                .status(415)
                .json({ success: false, error: "File type not supported." });
        }

        // Generate a unique storage key
        const ext = originalname.split(".").pop();
        const key = `admin-chat/${sessionId}/${userId}-${Date.now()}.${ext}`;

        // Upload to S3
        const {
            s3Client,
            S3_BUCKET,
            generatePresignedUrl,
        } = require("../config/s3");
        const { PutObjectCommand } = require("@aws-sdk/client-s3");

        await s3Client.send(
            new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: key,
                Body: buffer,
                ContentType: mimetype,
                ContentDisposition: `inline; filename="${originalname}"`,
            }),
        );

        // Generate a pre-signed URL for immediate viewing
        const signedUrl = await generatePresignedUrl(key);

        const attachment = {
            url: signedUrl || `https://${S3_BUCKET}.s3.amazonaws.com/${key}`,
            key,
            originalName: originalname,
            mimeType: mimetype,
            size,
        };

        logger.info("[adminChat] File uploaded", { sessionId, userId, key, size });

        return res.status(200).json({ success: true, data: attachment });
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
    getAuditLogs,
    getSessionMessages,
    markSessionResolved,
    searchSessions,
    uploadAttachment,
};
