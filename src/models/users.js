const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    profileName: {
      type: String,
    },
    bio: {
      type: String,
      maxlength: 150,
    },
    accountStatus: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    gender: {
      type: String,
      enum: ["male", "female"],
    },
    phoneNumber: {
      type: String,
      trim: true,
    },

    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    resetToken: { type: String },
    resetTokenExpires: { type: Date },

    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
  },

  { timestamps: true },
);

const User = mongoose.model("User", userSchema);
module.exports = User;
