import { Response } from "express";
import jwt from "jsonwebtoken";
import { UserDocument } from "../models/User";
import { env } from "../config/env";

interface SendTokenOptions {
  user: UserDocument;
  statusCode: number;
  message: string;
  res: Response;
}

export const sendToken = ({
  user,
  statusCode,
  message,
  res,
}: SendTokenOptions): void => {
  // Access token (SHORT LIVED)
  const accessToken = jwt.sign(
    { id: user._id.toString() },
    env.JWT_SECRET!,
    { expiresIn: "15m" }
  );

  // Refresh token (LONG LIVED)
  const refreshToken = jwt.sign(
    { id: user._id.toString() },
    env.JWT_REFRESH_SECRET!,
    { expiresIn: "7d" }
  );

  // Store refresh token in cookie
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // src/utils/sendToken.ts

  res.status(statusCode).json({
    success: true,
    message,
    accessToken,
    user: {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      pjNumber: user.pjNumber,
      role: user.role,
      accountVerified: user.accountVerified,
      // FIX: Return only the URL string to match the updateProfile response
      avatar: user.avatar?.url || "", 
    },
  });
};
