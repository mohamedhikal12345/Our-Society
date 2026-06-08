const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },
    // ── 220 ── Delivered to these users
    deliveredTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    deliveryStatus: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        status: {
          type: String,
          enum: ["sent", "delivered", "seen"],
          default: "sent",
        },
        deliveredAt: { type: Date },
        seenAt: { type: Date },
      },
    ],
    // ── 221 ── Seen by these users
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },

  { timestamps: true },
);

messageSchema.index({ chat: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
