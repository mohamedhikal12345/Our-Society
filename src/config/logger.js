require("winston-mongodb");
const winston = require("winston");
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({
      level: "debug",
    }),
    new winston.transports.File({
      filename: "logs/errors.log",
      level: "error",
    }),
    new winston.transports.MongoDB({
      db: process.env.DB,
      level: "error",
    }),
  ],
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception", err);
  logger.on("finish", () => {
    process.exit(1);
  });
  logger.end();
});
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled promise rejection ", err);
  logger.on("finish", () => {
    process.exit(1);
  });
  logger.end();
});
module.exports = logger;
