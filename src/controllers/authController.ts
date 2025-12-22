import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { User, UserDocument } from "../models/User";
import { sendToken } from "../utils/sendToken";

/* =========================
   AUTH CONTROLLER
========================= */
export const authController = {
  // --------------------------
  // Login
  // --------------------------
  login: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = (await User.findOne({ email: normalizedEmail }).select(
      "+password"
    )) as UserDocument | null;

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // ✅ Issue ACCESS TOKEN ONLY
    await sendToken({
      user,
      statusCode: 200,
      message: "Logged in successfully",
      res,
    });
  }),

  // --------------------------
  // Logout
  // --------------------------
  logout: asyncHandler(async (_req: Request, res: Response) => {
    // Stateless logout (JWT)
    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  }),

  // --------------------------
  // Get current logged-in user
  // --------------------------
  getCurrentUser: asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    res.status(200).json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        pjNumber: user.pjNumber,
        role: user.role,
        accountVerified: user.accountVerified,
        avatar: user.avatar,
      },
    });
  }),
};
