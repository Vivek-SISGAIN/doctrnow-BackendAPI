const express = require("express");
const router = express.Router();
const {
    sendMessage,
    getMessages,
    searchMessages,
    getSessionInfo,
    createSession,
    startSession,
    endSession,
    markConversationRead,
    getConversationInbox,
    muteConversation,
    unmuteConversation,
    archiveConversation,
    unarchiveConversation,
    pinConversation,
    unpinConversation
} = require("../controllers/chat.controller");

// ─── Messages ─────────────────────────────────────────────────────────────────
router.post("/messages", sendMessage);
router.get("/messages", getMessages);

// Part 5: Full-text message search
// NOTE: must be defined BEFORE /messages/:id to avoid route conflicts
router.get("/messages/search", searchMessages);

// ─── Conversation Inbox ───────────────────────────────────────────────────────
router.get("/conversations", getConversationInbox);            // GET  inbox list (supports ?includeArchived=true)
router.post("/conversations/:id/read", markConversationRead);  // POST mark as read

// Part 4: Per-participant conversation state actions
router.post("/conversations/:id/mute",      muteConversation);
router.post("/conversations/:id/unmute",    unmuteConversation);
router.post("/conversations/:id/archive",   archiveConversation);
router.post("/conversations/:id/unarchive", unarchiveConversation);
router.post("/conversations/:id/pin",       pinConversation);
router.post("/conversations/:id/unpin",     unpinConversation);

// ─── Session Info ─────────────────────────────────────────────────────────────
router.get("/session-info", getSessionInfo);

// ─── Session Lifecycle ────────────────────────────────────────────────────────
router.post("/session/create", createSession);
router.post("/session/start",  startSession);
router.post("/session/end",    endSession);

module.exports = router;
