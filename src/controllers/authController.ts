import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { sendToken } from "../utils/sendToken";
import { env } from "../config/env";
import { logActivity } from "../utils/activityLogger"; // Import the logger

export const authController = {
  // LOGIN
  login: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      // Log failed attempt if user exists
      // Inside LOGIN failure
      if (user) {
        await logActivity({
          user: user._id,
          userName: user.name, // We found the user, but password was wrong
          action: "FAILED_LOGIN_ATTEMPT",
          level: "warn",
          meta: { email, ip: req.ip },
        });
      } else {
        // Optional: Log attempt for non-existent user
        await logActivity({
          user: "SYSTEM",
          userName: email, // Use the email as the name for context
          action: "UNKNOWN_USER_LOGIN_ATTEMPT",
          level: "error",
        });
      }
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Log successful login
    await logActivity({
      user: user._id,
      userName: user.name,
      action: "USER_LOGIN",
      level: "success",
      meta: { role: user.role },
    });

    sendToken({
      user,
      statusCode: 200,
      message: "Logged in successfully",
      res,
    });
  }),

  // LOGOUT
  logout: asyncHandler(async (req: any, res: Response) => {
    // Assuming you have the user on the req object via auth middleware
    if (req.user) {
      await logActivity({
        user: req.user._id,
        userName: req.user.name,
        action: "USER_LOGOUT",
        level: "info",
      });
    }

    res
      .clearCookie("refreshToken", {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: env.NODE_ENV === "production" ? "none" : "lax",
        path: "/api/v1/auth/refresh",
      })
      .status(200)
      .json({ success: true, message: "Logged out" });
  }),

  // REFRESH ACCESS TOKEN
  refreshToken: asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken)
      return res.status(401).json({ message: "Not authenticated" });

    let payload: any;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET!);
    } catch {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: "User not found" });

    // Optional: Log token refresh if you want high granularity
    /* await logActivity({ user: user._id, action: "TOKEN_REFRESHED", level: "info" }); */

    sendToken({
      user,
      statusCode: 200,
      message: "Token refreshed",
      res,
    });
  }),
};
