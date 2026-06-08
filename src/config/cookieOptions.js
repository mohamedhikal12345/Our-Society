// src/config/cookieOptions.js

const isProduction = process.env.NODE_ENV === "production";

// ✅ Dynamic cookie (supports rememberMe)
const getRefreshTokenOptions = (expiryDays) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: "strict",
  maxAge: expiryDays * 24 * 60 * 60 * 1000,
});

// ✅ Clear cookie (for logout)
const clearCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "strict",
};

module.exports = {
  getRefreshTokenOptions, // dynamic one
  clearCookieOptions, // for logout
};
