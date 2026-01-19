import { Response, NextFunction } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { logActivity } from "../utils/activityLogger";
import { env } from "../config/env";

/**
 * ⏱ Inactivity timeout in milliseconds (15 mins)
 */
const INACTIVITY_LIMIT = 15 * 60 * 1000;

export const inactivityMiddleware = asyncHandler(
  async (req: any, res: Response, next: NextFunction) => {
    if (!req.user) return next(); // not logged in, skip

    const lastActivity = req.user.lastActivityAt
      ? new Date(req.user.lastActivityAt).getTime()
      : null;

    const now = Date.now();

    if (lastActivity && now - lastActivity > INACTIVITY_LIMIT) {
      // Log inactivity forced logout
      await logActivity({
        user: req.user._id,
        userName: req.user.name,
        action: "SESSION_EXPIRED_INACTIVITY",
        level: "info",
      });

      // Lock account temporarily (force re-login via OTP)
      req.user.accountLocked = true;
      await req.user.save();

      // Clear refresh token
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: env.NODE_ENV === "production" ? "none" : "lax",
        path: "/api/v1/auth/refresh",
      });

      return res.status(401).json({
        message: "Session expired due to inactivity. Please log in again.",
      });
    }

    // Update last activity timestamp
    req.user.lastActivityAt = new Date();
    await req.user.save();

    next();
  }
);
