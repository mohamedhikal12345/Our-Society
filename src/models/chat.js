const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    // For private chats: exactly 2 members
    // For group chats (222+): 2+ members
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    // ── 222 ── Group fields
    isGroup: {
      type: Boolean,
      default: false,
    },
    groupName: {
      type: String,
      default: null,
    },
    groupAvatar: {
      type: String,
      default: null,
    },
    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Last message preview for chat list (206)
    lastMessage: {
      text: { type: String, default: "" },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      sentAt: { type: Date, default: null },
      seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
  },
  { timestamps: true },
);

chatSchema.index({ members: 1 });

module.exports = mongoose.model("Chat", chatSchema);
