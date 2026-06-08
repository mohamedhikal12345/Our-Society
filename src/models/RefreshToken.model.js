const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  rememberMe: {
    type: Boolean,
    default: false, // ← was user on "remember me" or not
  },
  lastUsedAt: {
    type: Date,
    default: Date.now, // ← track last activity for sliding session
  },
});

// Auto delete expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
