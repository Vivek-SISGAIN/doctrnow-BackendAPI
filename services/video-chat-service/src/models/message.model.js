const mongoose = require("mongoose");

const deliverySchema = new mongoose.Schema(
    {
        userId: String,
        deliveredAt: Date
    },
    { _id: false }
);

const readSchema = new mongoose.Schema(
    {
        userId: String,
        readAt: Date
    },
    { _id: false }
);

const fileSchema = new mongoose.Schema(
    {
        url: String,
        name: String,
        size: Number,
        mimeType: String
    },
    { _id: false }
);

const messageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
            index: true
        },

        consultationId: {
            type: String,
            required: true,
            index: true
        },

        consultationSessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ConsultationChatSession",
            index: true
        },

        senderId: {
            type: String,
            required: true
        },

        senderRole: {
            type: String,
            enum: ["DOCTOR", "PATIENT", "ADMIN", "SYSTEM"],
            required: true,
            index: true
        },

        type: {
            type: String,
            enum: ["TEXT", "IMAGE", "FILE", "SYSTEM"],
            default: "TEXT"
        },

        content: String,

        file: fileSchema,

        status: {
            type: String,
            enum: ["SENT", "DELIVERED", "READ"],
            default: "SENT",
            index: true
        },

        deliveredTo: [deliverySchema],

        readBy: [readSchema],

        edited: {
            type: Boolean,
            default: false
        },

        deleted: {
            type: Boolean,
            default: false
        },

        // Structured event code for system-generated divider messages.
        // Only set when senderRole === "SYSTEM" and type === "SYSTEM".
        // Frontend renders localized text from this code; no free-text content is stored.
        systemEvent: {
            type: String,
            enum: [
                "SESSION_STARTED",
                "CONSULTATION_COMPLETED",
                "CHAT_CLOSED",
                "CONSULTATION_CANCELLED",
                "PATIENT_NO_SHOW",
                "DOCTOR_NO_SHOW"
            ]
        },

        clientMessageId: String
    },
    { timestamps: true }
);
messageSchema.pre("validate", function (next) {

    // SYSTEM message rules
    if (this.senderRole === "SYSTEM") {
        if (this.type !== "SYSTEM") {
            return next(new Error("SYSTEM messages must have type SYSTEM"));
        }
        if (!this.systemEvent) {
            return next(new Error("SYSTEM messages must have systemEvent"));
        }
        this.content = undefined;
        this.file = undefined;
    }

    // Reverse guard
    if (this.type === "SYSTEM" && this.senderRole !== "SYSTEM") {
        return next(new Error("Only SYSTEM role can send SYSTEM messages"));
    }

    // Prevent systemEvent misuse
    if (this.senderRole !== "SYSTEM" && this.systemEvent) {
        return next(new Error("systemEvent allowed only for SYSTEM messages"));
    }

    next();
});
messageSchema.index({ conversationId: 1, createdAt: -1 });

messageSchema.index(
    { conversationId: 1, clientMessageId: 1 },
    { unique: true, sparse: true }
);

// Part 5: Full-text search on message content
messageSchema.index({ content: "text" });

// Scale indexes: efficient delivery/read queries under high concurrency
messageSchema.index({ conversationId: 1, status: 1 });
messageSchema.index({ conversationId: 1, senderId: 1, status: 1 });
messageSchema.index({ conversationId: 1, "deliveredTo.userId": 1 });
messageSchema.index({ conversationId: 1, readBy: 1 });

module.exports = mongoose.model("Message", messageSchema);