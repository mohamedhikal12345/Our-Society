const rateLimit = require("express-rate-limit");

// ✅ Login Limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 10 attempts
  message: {
    success: false,
    message: "Too many login attempts! Try again after 15 minutes.",
  },
});

// ✅ Register Limiter
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 3 registrations
  message: {
    success: false,
    message: "Too many accounts created! Try again after 1 hour.",
  },
});

// ✅ General API Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests
  message: {
    success: false,
    message: "Too many requests! Try again later.",
  },
});

// ✅ Post Limiter
const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 10 posts per hour
  message: {
    success: false,
    message: "Too many posts! Try again after 1 hour.",
  },
});

// ✅ Comment Limiter
const commentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 comments per minute
  message: {
    success: false,
    message: "Slow down! Too many comments.",
  },
});

module.exports = {
  loginLimiter,
  registerLimiter,
  apiLimiter,
  postLimiter,
  commentLimiter,
};
