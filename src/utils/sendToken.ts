import { Response } from "express";
import jwt from "jsonwebtoken";
import { UserDocument } from "../models/User";
import { env } from "../config/env";

/* ----------------------------
   Interface for options
---------------------------- */
interface SendTokenOptions {
  user: UserDocument;
  statusCode: number;
  message: string;
  res: Response;
}

/* ----------------------------
   sendToken: issues ACCESS token only
---------------------------- */
export const sendToken = async ({
  user,
  statusCode,
  message,
  res,
}: SendTokenOptions): Promise<void> => {
  // 1️⃣ Create access token (short-lived)
  const accessToken = jwt.sign(
    { id: user._id },
    env.JWT_SECRET!,
    {
      expiresIn: env.JWT_EXPIRE || "15m", // ✅ use normalized name
    }
  );

  // 2️⃣ Sanitize user before sending
  const sanitizedUser = {
    _id: user._id,
    name: user.name,
    email: user.email,
    pjNumber: user.pjNumber,
    role: user.role,
    accountVerified: user.accountVerified,
    avatar: user.avatar,
  };

  // 3️⃣ Send response
  res.status(statusCode).json({
    success: true,
    message,
    accessToken,
    user: sanitizedUser,
  });

  if (env.DEBUG_AUTH === "true") {
    console.log(`🔐 Access token issued for ${user.email}`);
  }
};
