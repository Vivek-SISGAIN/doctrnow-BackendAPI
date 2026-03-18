"use strict";

/**
 * conversationState.service.js
 *
 * Manages per-participant conversation state:
 *   mute / unmute
 *   archive / unarchive
 *   pin / unpin
 *
 * All writes use arrayFilters positional updates — O(1) targeted writes
 * with no full-document rewrites. All operations are idempotent.
 */

const mongoose = require("mongoose");
const Conversation = require("../models/conversation.model");
const logger = require("../utils/logger");

// ── Shared error classes ─────────────────────────────────────────────────────

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
        this.statusCode = 404;
    }
}

// ── Internal helper ──────────────────────────────────────────────────────────

/**
 * Validates that conversationId is a valid ObjectId format.
 * @param {string} conversationId
 */
const validateId = (conversationId) => {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        const err = new Error("Invalid conversationId");
        err.statusCode = 400;
        throw err;
    }
};

/**
 * Applies a $set update to the requesting participant's subdocument using
 * arrayFilters positional update syntax.
 *
 * @param {string} conversationId
 * @param {string} userId
 * @param {object} fields  - fields to $set on the matching participant
 * @param {string} action  - label for logging
 * @returns {Promise<object>} updated conversation (lean)
 */
const updateParticipantField = async (conversationId, userId, fields, action) => {
    validateId(conversationId);

    if (!userId) {
        const err = new Error("userId is required");
        err.statusCode = 400;
        throw err;
    }

    const setFields = {};
    for (const [key, value] of Object.entries(fields)) {
        setFields[`participants.$[p].${key}`] = value;
    }

    const updated = await Conversation.findOneAndUpdate(
        {
            _id: conversationId,
            "participants.userId": userId   // ensures user is a participant
        },
        { $set: setFields },
        {
            arrayFilters: [{ "p.userId": userId }],
            new: true,
            runValidators: false
        }
    ).lean();

    if (!updated) {
        throw new NotFoundError(
            "Conversation not found or you are not a participant"
        );
    }

    logger.info(`conversationState.${action}`, { conversationId, userId });

    return updated;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Mutes conversation notifications for this participant.
 */
const muteConversation = ({ conversationId, userId }) =>
    updateParticipantField(conversationId, userId, { muted: true }, "mute");

/**
 * Unmutes conversation notifications for this participant.
 */
const unmuteConversation = ({ conversationId, userId }) =>
    updateParticipantField(conversationId, userId, { muted: false }, "unmute");

/**
 * Archives the conversation for this participant (hides from default inbox).
 */
const archiveConversation = ({ conversationId, userId }) =>
    updateParticipantField(
        conversationId,
        userId,
        { archivedAt: new Date() },
        "archive"
    );

/**
 * Unarchives the conversation for this participant (restores to inbox).
 */
const unarchiveConversation = ({ conversationId, userId }) =>
    updateParticipantField(
        conversationId,
        userId,
        { archivedAt: null },
        "unarchive"
    );

/**
 * Pins the conversation for this participant (appears at top of inbox).
 */
const pinConversation = ({ conversationId, userId }) =>
    updateParticipantField(
        conversationId,
        userId,
        { pinnedAt: new Date() },
        "pin"
    );

/**
 * Unpins the conversation for this participant.
 */
const unpinConversation = ({ conversationId, userId }) =>
    updateParticipantField(
        conversationId,
        userId,
        { pinnedAt: null },
        "unpin"
    );

module.exports = {
    muteConversation,
    unmuteConversation,
    archiveConversation,
    unarchiveConversation,
    pinConversation,
    unpinConversation
};
