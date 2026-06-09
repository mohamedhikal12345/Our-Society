const jwt = require("jsonwebtoken");

//Generates a short-lived access token

const generateAccessToken = (data) => {
  return jwt.sign(data, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "15m",
  });
  // "access token need to update"
};

// Generates a long-lived refresh token

const generateRefreshToken = (data) => {
  return jwt.sign(data, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
};
const generateToken = (data) => {
  return jwt.sign(data, process.env.JWT_KEY);
};

module.exports = { generateAccessToken, generateRefreshToken, generateToken };
