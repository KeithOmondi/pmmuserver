import { Response, Request, NextFunction } from "express";
import jwt from "jsonwebtoken";
import ms from "ms";
import { env } from "../config/env";
import  { User, UserDocument } from "../models/User"; // Import the Mongoose model (default export)

// -----------------------------
// SEND TOKENS TO CLIENT
// -----------------------------
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

  // Cookie options with strict typing
  const cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax" | "none";
    path: string;
  } = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  };

  // Set cookies
  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: ms(env.JWT_EXPIRE),
  });

  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: ms(env.JWT_REFRESH_EXPIRE),
  });

  // Respond with user info (without tokens)
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

// -----------------------------
// REFRESH ACCESS TOKEN
// -----------------------------
export const refreshAccessToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken)
      return res.status(401).json({ message: "No refresh token" });

    // Verify refresh token
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as {
      id: string;
      tokenVersion: number;
    };

    // Find user via the Mongoose model (not the type)
    const user = await User.findById(payload.id);
    if (!user || user.tokenVersion !== payload.tokenVersion)
      return res.status(401).json({ message: "Invalid refresh token" });

    // Generate new access token
    const newAccessToken = jwt.sign(
      { id: user._id, tokenVersion: user.tokenVersion },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRE },
    );

    const isProduction = env.NODE_ENV === "production";

    // Set new access token cookie
    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
      maxAge: ms(env.JWT_EXPIRE),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("[REFRESH TOKEN ERROR]:", err);
    return res.status(401).json({ message: "Failed to refresh token" });
  }
};
