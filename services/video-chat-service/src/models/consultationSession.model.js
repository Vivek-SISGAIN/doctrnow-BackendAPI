const mongoose = require("mongoose");

const consultationSessionSchema = new mongoose.Schema(
    {
        consultationId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
            index: true
        },

        startedAt: Date,

        endedAt: Date,

        status: {
            type: String,
            enum: [
                "NOT_STARTED",
                "ACTIVE",
                "COMPLETED",
                "PATIENT_NO_SHOW",
                "DOCTOR_NO_SHOW",
                "CANCELLED"
            ],
            default: "NOT_STARTED",
            index: true
        },

        postMessageLimit: {
            type: Number,
            default: 0
        },

        patientPostMessageCount: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

consultationSessionSchema.index({
    consultationId: 1,
    status: 1
});

module.exports = mongoose.model(
    "ConsultationChatSession",
    consultationSessionSchema
);