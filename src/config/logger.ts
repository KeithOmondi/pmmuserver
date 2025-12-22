import { createLogger, format, transports } from "winston";
import { env } from "./env";

const { combine, timestamp, printf, colorize } = format;

const logFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}] ${message}`;
});

export const logger = createLogger({
  level: env.NODE_ENV === "development" ? "debug" : "info",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    env.NODE_ENV === "development" ? colorize() : format.json(),
    logFormat
  ),
  transports: [
    new transports.Console(),
    ...(env.NODE_ENV === "production"
      ? [
          new transports.File({
            filename: "logs/error.log",
            level: "error",
          }),
          new transports.File({
            filename: "logs/combined.log",
          }),
        ]
      : []),
  ],
});
