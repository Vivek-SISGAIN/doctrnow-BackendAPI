"use strict";

/**
 * Admin Chat Routes
 * ─────────────────
 * All routes require the API Gateway to have injected x-user-id / x-user-role
 * headers (same pattern as existing chat routes).
 *
 * No separate auth middleware is needed here because the gateway already
 * validates the JWT and forwards the identity.  Role checks are enforced
 * inside each controller function.
 */

const express = require("express");
const router  = express.Router();

const {
    createRequest,
    listRequests,
    acceptRequest,
    endSession,
    getSession,
    getMySession,
    getAuditLogs
} = require("../controllers/adminChat.controller");

// ─── Hospital Admin ───────────────────────────────────────────────────────────

/** Create a new support-chat request */
router.post("/request", createRequest);

/** Fetch own active/pending session */
router.get("/my-session", getMySession);

// ─── Super Admin ──────────────────────────────────────────────────────────────

/** List incoming chat requests (default: REQUESTED) */
router.get("/requests", listRequests);

/** Accept a specific request (atomic claim) */
router.post("/requests/:id/accept", acceptRequest);

/** Fetch audit logs of ENDED sessions */
router.get("/audit-logs", getAuditLogs);

// ─── Shared ───────────────────────────────────────────────────────────────────

/** Fetch a single session by ID */
router.get("/session/:id", getSession);

/** End an ACTIVE session (either party) */
router.post("/requests/:id/end", endSession);

module.exports = router;
