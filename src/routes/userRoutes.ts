// src/routes/userRoutes.ts
import express from "express";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/userController";
import { isAuthenticated, isAuthorized } from "../middleware/auth";

const router = express.Router();

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
router.post(
  "/create",
  isAuthenticated,
  isAuthorized("SuperAdmin", "Admin"),
  createUser
);

// PUT update user
router.put(
  "/update/:id",
  isAuthenticated,
  isAuthorized("SuperAdmin", "Admin"),
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
