const mongoose = require("mongoose");

const adminChatMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminChatSession",
      required: true,
      index: true,
    },
    senderId: { type: String, required: true },
    senderRole: { type: String, required: true },
    text: { type: String, default: "" },
    clientMsgId: { type: String, default: null },
    readBy: [
      {
        userId: String,
        readAt: Date,
        _id: false,
      },
    ],
    attachments: [
      {
        url: { type: String, required: true },
        key: { type: String, required: true },
        originalName: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
        _id: false,
      }
    ],
  },
  { timestamps: true }
);

// Fast lookup: all messages for a session, newest last
adminChatMessageSchema.index({ sessionId: 1, createdAt: 1 });

// Deduplication by clientMsgId per session
adminChatMessageSchema.index(
  { sessionId: 1, clientMsgId: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model("AdminChatMessage", adminChatMessageSchema);
