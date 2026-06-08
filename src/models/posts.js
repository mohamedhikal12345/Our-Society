const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 2200,
      default: "",
    },
    // Array of media objects (images or videos)
    media: [
      {
        name: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          enum: ["image", "video"],
          required: true,
        },
        publicId: {
          type: String,
          default: null,
        },
      },
    ],
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    likesCount: {
      type: Number,
      default: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
    },
    tags: [{ type: String }],
    location: { type: String },
  },
  { timestamps: true },
);

postSchema.index({ author: 1, createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);
