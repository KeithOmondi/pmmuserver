import express from "express";
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getCategoryHierarchy,
} from "../controllers/categoryController";
import { isAuthenticated, isAuthorized } from "../middleware/auth";

const router = express.Router();

/* ============================================================
   📘 CATEGORY ROUTES
============================================================ */

/* ---------- PUBLIC ROUTES (No Authentication Required) ---------- */

// Get all categories
router.get(
  "/get",
  isAuthenticated,

  getAllCategories
);

// Get category by ID or code
router.get(
  "/get/:id",
  isAuthenticated,
  isAuthorized("Admin", "superAdmin"),
  getCategoryById
);

// Get subcategories (or hierarchical data)
router.get(
  "/sub/:code",
  isAuthenticated,
  getCategoryHierarchy
); // use `code` instead of `parentId` for A–E logic

/* ---------- ADMIN ROUTES (Protected) ---------- */

// Create a new category
router.post(
  "/create",
  isAuthenticated,
  isAuthorized("Admin", "superAdmin"),
  createCategory
);

// Update a category
router.put(
  "/update/:id",
  isAuthenticated,
  isAuthorized("Admin", "superAdmin"),
  updateCategory
);

// Delete a category
router.delete(
  "/delete/:id",
  isAuthenticated,
  isAuthorized("Admin", "superAdmin"),
  deleteCategory
);

export default router;
