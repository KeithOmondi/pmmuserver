// src/controllers/userController.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { User } from "../models/User";
import { uploadToCloudinary } from "../utils/cloudinary";
import { logActivity } from "../utils/activityLogger"; // Integrated Redis + Mongo Logger

/* =====================
    CONTROLLERS
===================== */

/**
 * CREATE NEW USER (Admin Action)
 */
export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
    });

    // LOG ACTIVITY
    await logActivity({
      user: (req.user as any)?._id, // Admin performing the action
      action: "USER_CREATED",
      entity: "User",
      entityId: newUser._id,
      meta: { name: newUser.name, role: newUser.role, email: newUser.email },
    });

    res.status(201).json({
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
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
    const { name, email, password, role } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (password) user.password = await bcrypt.hash(password, 10);

    await user.save();

    // LOG ACTIVITY
    await logActivity({
      user: (req.user as any)?._id,
      action: "USER_UPDATED",
      entity: "User",
      entityId: user._id,
      meta: {
        updatedFields: Object.keys(req.body).filter((k) => k !== "password"),
      },
    });

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
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

    // LOG ACTIVITY
    await logActivity({
      user: (req.user as any)?._id,
      action: "USER_DELETED",
      entity: "User",
      entityId: id,
      meta: { deletedName: deleted.name, deletedEmail: deleted.email },
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
    const userDoc = await User.findById(authenticatedUserId);

    if (!userDoc) return res.status(404).json({ message: "User not found" });

    const { name, email } = req.body;

    if (name) userDoc.name = name;
    if (email) {
      const emailExists = await User.findOne({
        email,
        _id: { $ne: userDoc._id },
      });
      if (emailExists)
        return res.status(400).json({ message: "Email already in use" });
      userDoc.email = email;
    }

    // Role Normalization (Casing Fix)
    const currentRole = userDoc.role as string;
    if (currentRole === "user") userDoc.role = "User" as any;
    if (currentRole === "admin") userDoc.role = "Admin" as any;
    if (currentRole === "superadmin") userDoc.role = "SuperAdmin" as any;

    if (req.file) {
      const folder = "user_avatars";
      const fileName = `avatar-${userDoc._id}-${Date.now()}`;
      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        folder,
        fileName
      );

      userDoc.avatar = {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      };
    }

    await userDoc.save();

    // LOG ACTIVITY (Self-Update)
    await logActivity({
      user: userDoc._id,
      action: "PROFILE_SELF_UPDATE",
      entity: "User",
      entityId: userDoc._id,
      meta: { updatedAvatar: !!req.file },
    });

    res.status(200).json({
      success: true,
      user: {
        _id: userDoc._id,
        name: userDoc.name,
        email: userDoc.email,
        role: userDoc.role,
        avatar: userDoc.avatar?.url,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
};

/**
 * GET ALL USERS
 */
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find().select("-password");
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

    const user = await User.findById(id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch user", error: err });
  }
};
