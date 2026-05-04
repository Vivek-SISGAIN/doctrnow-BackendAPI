"use strict";

/**
 * AdminChatSession — lightweight audit-oriented model for
 * Hospital Admin ↔ Super Admin support sessions.
 *
 * Deliberately does NOT reuse Conversation / ConsultationChatSession
 * so that the existing patient-doctor flow remains untouched.
 *
 * Only the session lifecycle is persisted (no per-message storage).
 */

const mongoose = require("mongoose");

const adminChatSessionSchema = new mongoose.Schema(
    {
        /**
         * The Hospital Admin who raised the support request.
         * Populated from req.user (x-user-id header from gateway).
         */
        hospitalAdminId: {
            type: String,
            required: true,
            index: true
        },

        /**
         * The Super Admin who accepted the request.
         * Null until a super admin claims it.
         */
        superAdminId: {
            type: String,
            default: null,
            index: true
        },

        /**
         * Human-readable display names — stored for audit log readability
         * so logs remain useful even if users are later deleted.
         */
        hospitalAdminName: { type: String, default: null },
        superAdminName:    { type: String, default: null },
        hospitalName:      { type: String, default: null },

        /**
         * Lifecycle status.
         *   REQUESTED  — hospital admin has opened a request, waiting for a super admin
         *   ACTIVE     — a super admin has accepted, chat is live
         *   ENDED      — session was explicitly closed by either party
         */
        status: {
            type: String,
            enum: ["REQUESTED", "ACTIVE", "ENDED"],
            default: "REQUESTED",
            index: true
        },

        /** Set when a super admin accepts (REQUESTED → ACTIVE). */
        startedAt: { type: Date, default: null },

        /** Set when either party ends the session (ACTIVE → ENDED). */
        endedAt: { type: Date, default: null },

        /**
         * Optional subject / initial message so the super admin sees
         * context before accepting.
         */
        subject: { type: String, default: null },

        // Whether the session has been marked resolved by a super admin
        resolved: {
            type: Boolean,
            default: false,
            index: true,
        },

        // Last message preview — for showing in session list without querying messages
        lastMessagePreview: { type: String, default: null },
        lastMessageAt: { type: Date, default: null }
    },
    { timestamps: true }   // adds createdAt (= when request was raised) + updatedAt
);

// Compound index: list open requests for super admins quickly
adminChatSessionSchema.index({ status: 1, createdAt: -1 });

// Compound index: list sessions for a given hospital admin
adminChatSessionSchema.index({ hospitalAdminId: 1, status: 1, createdAt: -1 });

adminChatSessionSchema.index({ status: 1, resolved: 1, lastMessageAt: -1 });

module.exports = mongoose.model("AdminChatSession", adminChatSessionSchema);
