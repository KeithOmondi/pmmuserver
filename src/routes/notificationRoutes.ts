import { Router } from "express";
import { isAuthenticated, isAuthorized } from "../middleware/auth";
import {
  getMyNotifications,
  getAllNotifications,
  markAsRead,
} from "../controllers/notificationController";

const router = Router();

// User routes
router.get("/my", isAuthenticated, getMyNotifications);
router.patch("/mark/:id/read", isAuthenticated, markAsRead);

// Admin route
router.get("/all", isAuthenticated, isAuthorized("Admin", "SuperAdmin"), getAllNotifications);

export default router;
