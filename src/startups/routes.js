const cors = require("cors");
const express = require("express");
const logger = require("../config/logger");
const cookieParser = require("cookie-parser");
const limiter = require("express-rate-limit");

const userRoutes = require("../routes/users");
const postRoutes = require("../routes/posts");
const chatRoutes = require("../routes/chat");

module.exports = function (app) {
  app.use(
    cors({
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(limiter());
  app.use("/api/user", userRoutes);
  app.use("/api/posts", postRoutes);
  app.use("/api/chats", chatRoutes);
  // custom error handler
  app.use((error, req, res, next) => {
    console.log("Error middleware is running");
    logger.error(error.message, {
      method: req.method,
      path: req.originalUrl,
      stack: error.stack,
    });
    res.status(500).json({ message: "Internal Server Error!" });
  });
};
