const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    // null = top-level comment
    // ObjectId = this is a reply to that comment
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },
    repliesCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Fast queries: fetch all comments for a post, or all replies for a comment
commentSchema.index({ post: 1, parentComment: 1, createdAt: -1 });

module.exports = mongoose.model("Comment", commentSchema);
