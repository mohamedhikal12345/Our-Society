const mongoose = require("mongoose");

const followRequestSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true },
);

// Prevent duplicate requests between same two users
followRequestSchema.index({ sender: 1, receiver: 1 }, { unique: true });

module.exports = mongoose.model("FollowRequest", followRequestSchema);
