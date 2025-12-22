import { Router } from "express";
import { authController } from "../controllers/authController";
import { isAuthenticated } from "../middleware/auth";

const router = Router();

/* =========================
   AUTH ROUTES
========================= */

// Login user
router.post("/login", authController.login);

// Logout user (requires user to be authenticated)
router.post("/logout", isAuthenticated, authController.logout);

// Get current logged-in user (protected)
router.get("/me", authController.getCurrentUser);

export default router;
