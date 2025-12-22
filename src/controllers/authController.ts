import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { sendToken } from "../utils/sendToken";
import { env } from "../config/env";

/* =========================
   AUTH CONTROLLER
========================= */
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
      return res.status(401).json({ message: "Invalid credentials" });
    }

    sendToken({
      user,
      statusCode: 200,
      message: "Logged in successfully",
      res,
    });
  }),

  // LOGOUT
  logout: asyncHandler(async (_req: Request, res: Response) => {
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
    if (!refreshToken) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    let payload: any;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET!);
    } catch {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    sendToken({
      user,
      statusCode: 200,
      message: "Token refreshed",
      res,
    });
  }),
};
