const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // console.log("JWT_KEY:", process.env.JWT_KEY); // ← is it undefined?

  const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1].replace(/"/g, "") : null;

  // console.log("Auth Header:", req.headers.authorization); // ← is token coming?

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    });
  }

  // console.log("Token:", token); // ← is token extracted?
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    // console.log("Decoded:", decoded); // ← is it decoding?
    req.user = decoded;
    next();
  } catch (err) {
    // console.log("JWT Error:", err);
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Access token expired",
        reason: "EXPIRED",
      });
    }
    return res.status(403).json({
      success: false,
      message: "Invalid access token",
    });
  }
};

module.exports = verifyToken;
