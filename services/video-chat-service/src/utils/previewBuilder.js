"use strict";

/**
 * Builds the denormalised preview string and metadata fields that
 * are written back to the Conversation document after every message.
 *
 * Rules:
 *   TEXT   → first 60 characters of content
 *   IMAGE  → "🖼 Image"
 *   FILE   → "📎 Attachment"
 *   SYSTEM → human-readable label derived from systemEvent code
 *
 * @param {object} params
 * @param {string} params.type         - MESSAGE type enum value
 * @param {string} [params.content]    - Text content (TEXT messages only)
 * @param {string} [params.systemEvent] - System event code (SYSTEM messages only)
 * @returns {{ lastMessagePreview, lastMessageType, lastSenderRole, lastSystemEvent }}
 */

const PREVIEW_MAX_LENGTH = 60;

const SYSTEM_EVENT_LABELS = {
    SESSION_STARTED:          "Session started",
    CONSULTATION_COMPLETED:   "Consultation completed",
    CHAT_CLOSED:              "Chat closed",
    CONSULTATION_CANCELLED:   "Consultation cancelled",
    PATIENT_NO_SHOW:          "Patient no-show",
    DOCTOR_NO_SHOW:           "Doctor no-show"
};

/**
 * @param {{ type: string, content?: string, senderRole: string, systemEvent?: string }} params
 * @returns {{ lastMessagePreview: string, lastMessageType: string, lastSenderRole: string, lastSystemEvent: string|null }}
 */
const buildPreview = ({ type, content, senderRole, systemEvent }) => {
    let preview;

    switch (type) {
        case "TEXT":
            preview = (content || "").slice(0, PREVIEW_MAX_LENGTH);
            break;
        case "IMAGE":
            preview = "🖼 Image";
            break;
        case "FILE":
            preview = "📎 Attachment";
            break;
        case "SYSTEM":
            preview = SYSTEM_EVENT_LABELS[systemEvent] || systemEvent || "System event";
            break;
        default:
            preview = "";
    }

    return {
        lastMessagePreview: preview,
        lastMessageType:    type,
        lastSenderRole:     senderRole,
        lastSystemEvent:    type === "SYSTEM" ? (systemEvent || null) : null
    };
};

module.exports = { buildPreview };
