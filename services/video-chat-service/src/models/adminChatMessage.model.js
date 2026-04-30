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
    text: { type: String, required: true },
    clientMsgId: { type: String, default: null },
    readBy: [
      {
        userId: String,
        readAt: Date,
        _id: false,
      },
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
