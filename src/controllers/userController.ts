import { Request, Response } from "express";
import { Types } from "mongoose";
import { User } from "../models/User";
import { uploadToCloudinary } from "../utils/cloudinary";
import { logActivity } from "../utils/activityLogger";

/* =====================
    CONTROLLERS
===================== */

/**
 * CREATE NEW USER (Admin Action)
 * - No password
 * - Account locked by default
 * - Login happens via OTP
 */
export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, pjNumber, role } = req.body;

    if (!name || !email || !pjNumber) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existing = await User.findOne({
      $or: [{ email }, { pjNumber }],
    });

    if (existing) {
      return res
        .status(400)
        .json({ message: "Email or PJ Number already exists" });
    }

    const newUser = await User.create({
      name,
      email,
      pjNumber,
      role,
      accountLocked: true,
      accountVerified: false,
    });

    await logActivity({
      user: (req.user as any)?._id,
      action: "USER_CREATED",
      entity: "User",
      entityId: newUser._id,
      meta: {
        name: newUser.name,
        role: newUser.role,
        pjNumber: newUser.pjNumber,
      },
    });

    res.status(201).json({
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      pjNumber: newUser.pjNumber,
      role: newUser.role,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to create user", error: err });
  }
};

/**
 * UPDATE USER (Admin Action)
 */
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, pjNumber, role, accountLocked } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;

    if (email) {
      const exists = await User.findOne({
        email,
        _id: { $ne: user._id },
      });
      if (exists)
        return res.status(400).json({ message: "Email already in use" });
      user.email = email;
    }

    if (pjNumber) {
      const exists = await User.findOne({
        pjNumber,
        _id: { $ne: user._id },
      });
      if (exists)
        return res.status(400).json({ message: "PJ Number already in use" });
      user.pjNumber = pjNumber;
    }

    if (role) user.role = role;
    if (typeof accountLocked === "boolean") user.accountLocked = accountLocked;

    await user.save();

    await logActivity({
      user: (req.user as any)?._id,
      action: "USER_UPDATED",
      entity: "User",
      entityId: user._id,
      meta: {
        updatedFields: Object.keys(req.body),
      },
    });

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      pjNumber: user.pjNumber,
      role: user.role,
      accountLocked: user.accountLocked,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update user", error: err });
  }
};

/**
 * DELETE USER (Admin Action)
 */
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "User not found" });

    await logActivity({
      user: (req.user as any)?._id,
      action: "USER_DELETED",
      entity: "User",
      entityId: id,
      meta: {
        deletedName: deleted.name,
        deletedPJ: deleted.pjNumber,
      },
    });

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete user", error: err });
  }
};

/**
 * UPDATE PROFILE (User Self-Action)
 */
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = (req.user as any)?._id;
    const user = await User.findById(authenticatedUserId);

    if (!user) return res.status(404).json({ message: "User not found" });

    const { name, email } = req.body;

    if (name) user.name = name;

    if (email) {
      const emailExists = await User.findOne({
        email,
        _id: { $ne: user._id },
      });
      if (emailExists)
        return res.status(400).json({ message: "Email already in use" });
      user.email = email;
    }

    if (req.file) {
      const folder = "user_avatars";
      const fileName = `avatar-${user._id}-${Date.now()}`;

      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        folder,
        fileName
      );

      user.avatar = {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      };
    }

    await user.save();

    await logActivity({
      user: user._id,
      action: "PROFILE_SELF_UPDATE",
      entity: "User",
      entityId: user._id,
      meta: { updatedAvatar: !!req.file },
    });

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        pjNumber: user.pjNumber,
        role: user.role,
        avatar: user.avatar?.url,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
};

/**
 * GET ALL USERS
 */
export const getAllUsers = async (_req: Request, res: Response) => {
  try {
    const users = await User.find().select("-loginOtp -loginOtpExpiry");
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users", error: err });
  }
};

/**
 * GET SINGLE USER
 */
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id).select("-loginOtp -loginOtpExpiry");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch user", error: err });
  }
};
