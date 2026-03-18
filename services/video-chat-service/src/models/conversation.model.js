const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            index: true
        },
        role: {
            type: String,
            enum: ["DOCTOR", "PATIENT", "ADMIN", "SPECIALIST", "NURSE"],
            required: true
        },
        joinedAt: {
            type: Date,
            default: Date.now
        },
        leftAt: Date,

        // Tracks the last timestamp this participant fully read the conversation.
        // Unread count = messages with createdAt > lastReadMessageAt where senderId != userId
        lastReadMessageAt: {
            type: Date,
            default: null
        },

        // ── Part 4: Per-participant conversation state ───────────────────────
        muted: {
            type: Boolean,
            default: false
        },
        archivedAt: {
            type: Date,
            default: null
        },
        pinnedAt: {
            type: Date,
            default: null
        }
    },
    { _id: false }
);

const conversationSchema = new mongoose.Schema(
    {
        consultationId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        type: {
            type: String,
            enum: ["GROUP"],
            default: "GROUP"
        },

        participants: {
            type: [participantSchema],
            validate: [
                (val) => val.length >= 2,
                "Conversation must have at least doctor and patient"
            ]
        },

        chatState: {
            type: String,
            enum: ["SCHEDULED", "ACTIVE", "LIMITED", "CLOSED"],
            default: "SCHEDULED",
            index: true
        },

        lastMessage: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message"
        },

        lastMessageAt: Date,

        // ── Part 1: Denormalised preview fields ──────────────────────────────
        // Updated on every sendMessage / insertSystemMessage success.
        // Avoids a $lookup in the inbox aggregation hot path.

        /** TEXT → first 60 chars; IMAGE → "🖼 Image"; FILE → "📎 Attachment"; SYSTEM → derived */
        lastMessagePreview: {
            type: String,
            default: null
        },

        /** Mirrors message.type of the last message */
        lastMessageType: {
            type: String,
            enum: ["TEXT", "IMAGE", "FILE", "SYSTEM"],
            default: null
        },

        /** Mirrors senderRole of the last message */
        lastSenderRole: {
            type: String,
            enum: ["DOCTOR", "PATIENT", "ADMIN", "SYSTEM"],
            default: null
        },

        /** Set only when lastMessageType === "SYSTEM" */
        lastSystemEvent: {
            type: String,
            default: null
        }
    },
    { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Efficient participant lookup
conversationSchema.index({ "participants.userId": 1 });

// Inbox sort + cursor pagination (legacy — kept for backward compat)
conversationSchema.index({ lastMessageAt: -1 });

// Compound: filter by participant then sort by recency
conversationSchema.index({ "participants.userId": 1, lastMessageAt: -1 });

// Part 4: Inbox sort with pinned priority (pinnedAt DESC nulls-last, then lastMessageAt DESC)
conversationSchema.index({
    "participants.userId": 1,
    pinnedAt: -1,
    lastMessageAt: -1
});

module.exports = mongoose.model("Conversation", conversationSchema);