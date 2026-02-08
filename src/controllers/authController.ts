// src/controllers/authController.ts
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import ms from "ms";


import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { sendToken } from "../utils/sendToken";
import { env } from "../config/env";
import { logActivity } from "../utils/activityLogger";
import { redisClient } from "../config/redis";

import {
  OTP_MAX_ATTEMPTS,
  OTP_BLOCK_DURATION_MINUTES,
} from "../config/otpSecurity";

import sendMail from "../utils/sendMail";
import { otpLoginTemplate } from "../utils/mailTemplates";

/* =====================================================
   REQUEST LOGIN OTP
===================================================== */
export const requestLoginOtp = asyncHandler(
  async (req: Request, res: Response) => {
    const { pjNumber } = req.body;
    if (!pjNumber)
      return res.status(400).json({ message: "PJ Number is required" });

    const user = await User.findOne({ pjNumber });
    if (!user) {
      await logActivity({
        user: "SYSTEM",
        userName: pjNumber,
        action: "UNKNOWN_PJ_LOGIN_ATTEMPT",
        level: "warn",
        meta: { ip: req.ip },
      });
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.email) {
      return res.status(500).json({ message: "User has no email registered" });
    }

    const otp = user.generateLoginOtp();
    user.otpAttempts = 0;
    user.otpBlockedUntil = undefined;
    await user.save();

    try {
      const mail = otpLoginTemplate({
        name: user.name,
        otp,
        appUrl: env.FRONTEND_URL,
      });

      const response = await sendMail({
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });

      await logActivity({
        user: user._id,
        userName: user.name,
        action: "LOGIN_OTP_SENT",
        level: "info",
        meta: { resendResponse: response },
      });

      res.status(200).json({
        success: true,
        message: "OTP sent successfully to your email",
      });
    } catch (err: any) {
      res.status(500).json({
        message: "Failed to send OTP email",
        error: err.message,
      });
    }
  },
);

/* =====================================================
   VERIFY LOGIN OTP (CREATES SESSION)
===================================================== */
export const verifyLoginOtp = asyncHandler(
  async (req: Request, res: Response) => {
    const { pjNumber, otp } = req.body;
    if (!pjNumber || !otp) {
      return res
        .status(400)
        .json({ message: "PJ Number and OTP are required" });
    }

    const user = await User.findOne({ pjNumber }).select(
      "+loginOtp +loginOtpExpiry +otpAttempts +otpBlockedUntil",
    );

    if (!user || !user.loginOtp) {
      return res.status(401).json({ message: "Invalid login attempt" });
    }

    if (user.otpBlockedUntil && user.otpBlockedUntil.getTime() > Date.now()) {
      return res
        .status(429)
        .json({ message: "Too many OTP attempts. Try later." });
    }

    if (user.isOtpExpired()) {
      user.clearLoginOtp();
      user.otpAttempts = 0;
      user.otpBlockedUntil = undefined;
      await user.save();
      return res.status(401).json({ message: "OTP expired" });
    }

    const hashedInputOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    if (hashedInputOtp !== user.loginOtp) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;

      if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
        user.otpBlockedUntil = new Date(
          Date.now() + OTP_BLOCK_DURATION_MINUTES * 60 * 1000,
        );

        await logActivity({
          user: user._id,
          userName: user.name,
          action: "OTP_BLOCKED_TOO_MANY_ATTEMPTS",
          level: "warn",
          meta: {
            attempts: user.otpAttempts,
            ip: req.ip,
          },
        });
      }

      await user.save();
      return res.status(401).json({ message: "Invalid OTP" });
    }

    /* ======================
     OTP SUCCESS → LOGIN
  ====================== */
    user.clearLoginOtp();
    user.otpAttempts = 0;
    user.otpBlockedUntil = undefined;
    user.accountLocked = false;
    user.lastActivityAt = new Date();
    await user.save();

    /* ======================
     CREATE REDIS SESSION
  ====================== */
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    const sessionKey = `session:${user._id}:${user.tokenVersion}`;
    const loginAt = new Date();

    await redisClient.hSet(sessionKey, {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      loginAt: loginAt.toISOString(),
      ip: req.ip ?? "unknown",
      userAgent: String(req.headers["user-agent"] ?? "unknown"),
    });

    await redisClient.expire(sessionKey, 60 * 60 * 24); // 24h safety TTL

    await redisClient.lPush(
      "system:live_logs",
      JSON.stringify({
        type: "LOGIN",
        userId: user._id,
        email: user.email,
        role: user.role,
        timestamp: loginAt,
      }),
    );

    await logActivity({
      user: user._id,
      userName: user.name,
      action: "USER_LOGIN",
      level: "success",
    });

    sendToken({
      user,
      statusCode: 200,
      message: "Login successful",
      res,
    });
  },
);

/* =====================================================
   RESEND LOGIN OTP
===================================================== */
export const resendLoginOtp = asyncHandler(
  async (req: Request, res: Response) => {
    const { pjNumber } = req.body;
    if (!pjNumber)
      return res.status(400).json({ message: "PJ Number is required" });

    const user = await User.findOne({ pjNumber });
    if (!user) {
      await logActivity({
        user: "SYSTEM",
        userName: pjNumber,
        action: "UNKNOWN_PJ_RESEND_ATTEMPT",
        level: "warn",
        meta: { ip: req.ip },
      });
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.email) {
      return res.status(500).json({ message: "User has no email registered" });
    }

    const lastOtpTime = user.loginOtpExpiry
      ? user.loginOtpExpiry.getTime() - 5 * 60 * 1000
      : 0;

    if (user.loginOtp && Date.now() - lastOtpTime < 60 * 1000) {
      return res
        .status(429)
        .json({ message: "Please wait before requesting a new OTP" });
    }

    const otp = user.generateLoginOtp();
    user.otpAttempts = 0;
    user.otpBlockedUntil = undefined;
    await user.save();

    const mail = otpLoginTemplate({
      name: user.name,
      otp,
      appUrl: env.FRONTEND_URL,
    });

    await sendMail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    await logActivity({
      user: user._id,
      userName: user.name,
      action: "LOGIN_OTP_RESENT",
      level: "info",
    });

    res.status(200).json({
      success: true,
      message: "OTP resent successfully",
    });
  },
);

/* =====================================================
   LOGOUT (CLOSE SESSION + DURATION)
===================================================== */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;

  if (user) {
    // Ensure Redis connection
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    const sessionKey = `session:${user._id}:${user.tokenVersion}`;
    const session = await redisClient.hGetAll(sessionKey);

    // ---- LOG SESSION DURATION ----
    if (session?.loginAt) {
      const loginTime = new Date(session.loginAt);
      const logoutTime = new Date();
      const durationMinutes = Math.round(
        (logoutTime.getTime() - loginTime.getTime()) / 60000,
      );

      await redisClient.lPush(
        "system:live_logs",
        JSON.stringify({
          type: "LOGOUT",
          userId: user._id,
          email: session.email,
          role: session.role,
          loginAt: loginTime,
          logoutAt: logoutTime,
          durationMinutes,
        }),
      );
    }

    // ---- DESTROY SESSION ----
    await redisClient.del(sessionKey);

    // ---- REVOKE ALL TOKENS ----
    user.tokenVersion += 1;
    await user.save();

    await logActivity({
      user: user._id,
      userName: user.name,
      action: "USER_LOGOUT",
      level: "info",
    });
  }

  // ---- CLEAR AUTH COOKIES ----
  res
    .clearCookie("accessToken", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    })
    .clearCookie("refreshToken", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    })
    .status(200)
    .json({
      success: true,
      message: "Logged out successfully",
    });
});



/* =====================================================
   REFRESH TOKEN
===================================================== */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;

  if (!token) return res.status(401).json({ message: "Not authenticated" });

  let decoded: { id: string; tokenVersion: number };
  try {
    decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as {
      id: string;
      tokenVersion: number;
    };
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const user = await User.findById(decoded.id);
  if (!user) return res.status(401).json({ message: "User not found" });

  if (decoded.tokenVersion !== user.tokenVersion) {
    return res.status(401).json({ message: "Token revoked" });
  }

  // Generate new access token
  const newAccessToken = jwt.sign(
    { id: user._id.toString(), tokenVersion: user.tokenVersion },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRE }
  );

  // Dev-safe cookie options
  res.cookie("accessToken", newAccessToken, {
    httpOnly: true,
    path: "/",
    maxAge: ms(env.JWT_EXPIRE),
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.status(200).json({ success: true });
});




export const refreshSessionTTL = async (req: any, _res: any, next: any) => {
  if (req.user) {
    const sessionKey = `session:${req.user._id}:${req.user.tokenVersion}`;

    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    // Keep session alive (e.g. 30 minutes sliding window)
    await redisClient.expire(sessionKey, 60 * 30);
  }

  next();
};