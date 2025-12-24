import { Request, Response, NextFunction } from "express";
import { logActivity } from "../utils/activityLogger";

export const auditMiddleware = (
  req: any,
  res: Response,
  next: NextFunction
) => {
  // We only care about mutations (Changes to data)
  const trackedMethods = ["POST", "PUT", "PATCH", "DELETE"];

  if (trackedMethods.includes(req.method) && req.user) {
    // We use res.on('finish') to ensure we only log if the request was successful
    res.on("finish", async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await logActivity({
          user: req.user._id,
          action: `${req.method}_REQUEST`,
          entity: req.originalUrl,
          level: req.method === "DELETE" ? "warn" : "info",
          meta: {
            ip: req.ip,
            userAgent: req.get("user-agent"),
            statusCode: res.statusCode,
          },
        });
      }
    });
  }
  next();
};
