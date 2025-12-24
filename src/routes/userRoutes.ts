// src/routes/userRoutes.ts
import express from "express";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateProfile, // Add the new controller
} from "../controllers/userController";
import { isAuthenticated, isAuthorized } from "../middleware/auth";
import { upload } from "../middleware/multer";

const router = express.Router();

/* =========================================================
   SELF-SERVICE ROUTES (Current User)
   ========================================================= */

/**
 * PUT /api/users/profile
 * Allows a logged-in user to update their own data & avatar
 */
router.put(
  "/profile",
  isAuthenticated,
  upload.single("avatar"), // Process the "avatar" field from FormData
  updateProfile
);

/* =========================================================
   ADMINISTRATIVE ROUTES (Management)
   ========================================================= */

// GET all users
router.get(
  "/get",
  isAuthenticated,
  isAuthorized("SuperAdmin", "Admin"),
  getAllUsers
);

// GET user by ID
router.get(
  "/get/:id",
  isAuthenticated,
  isAuthorized("SuperAdmin", "Admin"),
  getUserById
);

// POST create new user
// Added upload.single if you want admins to upload avatars for new users
router.post(
  "/create",
  isAuthenticated,
  isAuthorized("SuperAdmin", "Admin"),
  upload.single("avatar"), 
  createUser
);

// PUT update user by ID
router.put(
  "/update/:id",
  isAuthenticated,
  isAuthorized("SuperAdmin", "Admin"),
  upload.single("avatar"),
  updateUser
);

// DELETE user
router.delete(
  "/delete/:id",
  isAuthenticated,
  isAuthorized("SuperAdmin", "Admin"),
  deleteUser
);

export default router;