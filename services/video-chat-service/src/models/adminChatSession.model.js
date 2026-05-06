"use strict";

/**
 * AdminChatSession — lightweight audit-oriented model for
 * Hospital Admin ↔ Super Admin support sessions.
 *
 * Deliberately does NOT reuse Conversation / ConsultationChatSession
 * so that the existing patient-doctor flow remains untouched.
 *
 * Only the session lifecycle is persisted (no per-message storage).
 *
 * v2: Extended to support Doctors and Patients as requesters alongside
 *     existing Hospital Admin sessions. All old sessions remain backward-
 *     compatible — requesterRole: null is treated as "HOSPITAL_ADMIN".
 */

const mongoose = require("mongoose");

const adminChatSessionSchema = new mongoose.Schema(
    {
        /**
         * The Hospital Admin who raised the support request.
         * Now optional — null when the requester is a Doctor or Patient.
         * Kept for full backward compatibility with existing records.
         */
        hospitalAdminId: {
            type: String,
            required: false,   // CHANGED from required: true
            default: null,
            index: true,
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
        hospitalId: {
            type: String,
            default: null,
            index: true
        },

        // ─── NEW: Doctor / Patient requester fields ────────────────────────

        /** Doctor who raised the support request (null if requester is not a doctor) */
        doctorId: {
            type: String,
            default: null,
            index: true,
        },

        /** Patient who raised the support request (null if requester is not a patient) */
        patientId: {
            type: String,
            default: null,
            index: true,
        },

        /**
         * Single display name for the person who raised the request.
         * Populated for all roles — complements hospitalAdminName (kept for backward compat).
         */
        requesterName: {
            type: String,
            default: null,
        },

        /**
         * The role of the person who raised the request.
         * "HOSPITAL_ADMIN" | "DOCTOR" | "PATIENT"
         * null on old records — treat as "HOSPITAL_ADMIN" in display logic.
         */
        requesterRole: {
            type: String,
            enum: ["HOSPITAL_ADMIN", "DOCTOR", "PATIENT", null],
            default: null,
            index: true,
        },

        // ─── END NEW ──────────────────────────────────────────────────────

        /**
         * Lifecycle status.
         *   REQUESTED  — requester has opened a request, waiting for a super admin
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

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Compound index: list open requests for super admins quickly
adminChatSessionSchema.index({ status: 1, createdAt: -1 });

// Compound index: list sessions for a given hospital admin
adminChatSessionSchema.index({ hospitalAdminId: 1, status: 1, createdAt: -1 });

adminChatSessionSchema.index({ status: 1, resolved: 1, lastMessageAt: -1 });
adminChatSessionSchema.index({ hospitalId: 1, status: 1, createdAt: -1 });

// Fast lookup: all sessions from a specific doctor
adminChatSessionSchema.index({ doctorId: 1, status: 1, createdAt: -1 });

// Fast lookup: all sessions from a specific patient
adminChatSessionSchema.index({ patientId: 1, status: 1, createdAt: -1 });

// Fast lookup: filter sessions by requesterRole in super admin panel
adminChatSessionSchema.index({ requesterRole: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("AdminChatSession", adminChatSessionSchema);
