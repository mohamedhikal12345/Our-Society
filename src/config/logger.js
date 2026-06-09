require("winston-mongodb");
const winston = require("winston");

const isProduction = process.env.NODE_ENV === "production";

const transports = [
  new winston.transports.Console({
    level: "debug",
  }),
  // ✅ Only write to file in local development
  ...(!isProduction
    ? [
        new winston.transports.File({
          filename: "logs/errors.log",
          level: "error",
        }),
      ]
    : []),
  // ✅ Only add MongoDB transport in production with timeout options
  ...(isProduction && process.env.DB
    ? [
        new winston.transports.MongoDB({
          db: process.env.DB,
          level: "error",
          tryReconnect: true,
          options: {
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
            socketTimeoutMS: 5000,
          },
        }),
      ]
    : []),
];

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports,
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception", err);
  logger.on("finish", () => process.exit(1));
  logger.end();
});

process.on("unhandledRejection", (err) => {
  logger.error("Unhandled promise rejection", err);
  logger.on("finish", () => process.exit(1));
  logger.end();
});

module.exports = logger;
