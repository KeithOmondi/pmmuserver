import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { sendToken } from "../utils/sendToken";
import { env } from "../config/env";
import { logActivity } from "../utils/activityLogger";
import {
  OTP_MAX_ATTEMPTS,
  OTP_BLOCK_DURATION_MINUTES,
} from "../config/otpSecurity";
import sendMail from "../utils/sendMail";
import { otpLoginTemplate } from "../utils/mailTemplates";

/* =====================================================
   REQUEST LOGIN OTP
===================================================== */
export const requestLoginOtp = asyncHandler(async (req: Request, res: Response) => {
  const { pjNumber } = req.body;
  if (!pjNumber) return res.status(400).json({ message: "PJ Number is required" });

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

  if (!user.email) return res.status(500).json({ message: "User has no email registered" });

  // Generate OTP
  const otp = user.generateLoginOtp();
  user.otpAttempts = 0;
  user.otpBlockedUntil = undefined;
  await user.save();

  try {
    const mailContent = otpLoginTemplate({ name: user.name, otp, appUrl: env.FRONTEND_URL });
    const response = await sendMail({
      to: user.email,
      subject: mailContent.subject,
      html: mailContent.html,
      text: mailContent.text,
    });

    await logActivity({
      user: user._id,
      userName: user.name,
      action: "LOGIN_OTP_SENT",
      level: "info",
      meta: { resendResponse: response },
    });

    res.status(200).json({ success: true, message: "OTP sent successfully to your email" });
  } catch (err: any) {
    console.error("Failed to send OTP email:", err);
    res.status(500).json({ message: "Failed to send OTP email", error: err.message });
  }
});

/* =====================================================
   VERIFY LOGIN OTP
===================================================== */
export const verifyLoginOtp = asyncHandler(async (req: Request, res: Response) => {
  const { pjNumber, otp } = req.body;
  if (!pjNumber || !otp) return res.status(400).json({ message: "PJ Number and OTP are required" });

  const user = await User.findOne({ pjNumber }).select("+loginOtp +loginOtpExpiry +otpAttempts +otpBlockedUntil");
  if (!user || !user.loginOtp) return res.status(401).json({ message: "Invalid login attempt" });

  if (user.otpBlockedUntil && user.otpBlockedUntil.getTime() > Date.now()) {
    return res.status(429).json({ message: "Too many OTP attempts. Try later." });
  }

  if (user.isOtpExpired()) {
    user.clearLoginOtp();
    user.otpAttempts = 0;
    user.otpBlockedUntil = undefined;
    await user.save();
    return res.status(401).json({ message: "OTP expired" });
  }

  const hashedInputOtp = crypto.createHash("sha256").update(otp).digest("hex");
  if (hashedInputOtp !== user.loginOtp) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      user.otpBlockedUntil = new Date(Date.now() + OTP_BLOCK_DURATION_MINUTES * 60 * 1000);
      await logActivity({ user: user._id, userName: user.name, action: "OTP_BLOCKED_TOO_MANY_ATTEMPTS", level: "warn" });
    }
    await user.save();
    return res.status(401).json({ message: "Invalid OTP" });
  }

  // OTP success
  user.clearLoginOtp();
  user.otpAttempts = 0;
  user.otpBlockedUntil = undefined;
  user.accountLocked = false;
  user.lastActivityAt = new Date();
  await user.save();

  await logActivity({ user: user._id, userName: user.name, action: "USER_LOGIN", level: "success" });
  sendToken({ user, statusCode: 200, message: "Login successful", res });
});

/* =====================================================
   RESEND LOGIN OTP
===================================================== */
export const resendLoginOtp = asyncHandler(async (req: Request, res: Response) => {
  const { pjNumber } = req.body;
  if (!pjNumber) return res.status(400).json({ message: "PJ Number is required" });

  const user = await User.findOne({ pjNumber });
  if (!user) {
    await logActivity({ user: "SYSTEM", userName: pjNumber, action: "UNKNOWN_PJ_RESEND_ATTEMPT", level: "warn", meta: { ip: req.ip } });
    return res.status(404).json({ message: "User not found" });
  }

  if (!user.email) return res.status(500).json({ message: "User has no email registered" });

  // Throttle resend: allow only if last OTP expired or 1 min passed
  const lastOtpTime = user.loginOtpExpiry ? user.loginOtpExpiry.getTime() - 5 * 60 * 1000 : 0;
  if (user.loginOtp && Date.now() - lastOtpTime < 60 * 1000) {
    return res.status(429).json({ message: "Please wait a minute before requesting a new OTP" });
  }

  // Generate new OTP
  const otp = user.generateLoginOtp();
  user.otpAttempts = 0;
  user.otpBlockedUntil = undefined;
  await user.save();

  try {
    const mailContent = otpLoginTemplate({ name: user.name, otp, appUrl: env.FRONTEND_URL });
    const response = await sendMail({ to: user.email, subject: mailContent.subject, html: mailContent.html, text: mailContent.text });

    await logActivity({ user: user._id, userName: user.name, action: "LOGIN_OTP_RESENT", level: "info", meta: { resendResponse: response } });

    res.status(200).json({ success: true, message: "OTP resent successfully to your email" });
  } catch (err: any) {
    console.error("Failed to resend OTP email:", err);
    res.status(500).json({ message: "Failed to resend OTP email", error: err.message });
  }
});

/* =====================================================
   LOGOUT (Invalidates all current sessions)
===================================================== */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.user) {
    // Now TypeScript knows .tokenVersion and .save() exist
    req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
    await req.user.save();

    await logActivity({
      user: req.user._id,
      userName: req.user.name,
      action: "USER_LOGOUT",
      level: "info",
    });
  }

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  })
  .status(200)
  .json({ success: true, message: "Logged out successfully" });
});

/* =====================================================
   REFRESH ACCESS TOKEN
===================================================== */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ message: "Not authenticated" });

  let payload: any;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET!);
  } catch {
    return res.status(401).json({ message: "Invalid refresh token" });
  }

  const user = await User.findById(payload.id);
  if (!user) return res.status(401).json({ message: "User not found" });
  
  // Security Check: Does the refresh token version match the DB?
  if (user.tokenVersion !== payload.tokenVersion) {
    return res.status(401).json({ message: "Session invalidated. Please login again." });
  }

  if (user.accountLocked) return res.status(401).json({ message: "Account locked" });

  // sendToken will issue new Access and Refresh tokens with the current tokenVersion
  sendToken({ user, statusCode: 200, message: "Token refreshed", res });
});
