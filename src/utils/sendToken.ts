import { Response } from "express";
import jwt from "jsonwebtoken";
import ms from "ms";
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
  const isProduction = env.NODE_ENV === "production";

  const payload = {
    id: user._id.toString(),
    tokenVersion: user.tokenVersion,
  };

  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRE,
  });

  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRE,
  });

  // Type-safe cookie options
  const cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax" | "strict" | "none";
    path: string;
  } = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  };

  // Access Token (short-lived)
  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: ms(env.JWT_EXPIRE),
  });

  // Refresh Token (long-lived)
  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: ms(env.JWT_REFRESH_EXPIRE),
  });

  res.status(statusCode).json({
    success: true,
    message,
    user: {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      pjNumber: user.pjNumber,
      role: user.role,
      accountVerified: user.accountVerified,
      avatar: user.avatar?.url || "",
    },
  });
};
