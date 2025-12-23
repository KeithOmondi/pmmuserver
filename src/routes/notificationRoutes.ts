import { Router } from "express";
import { isAuthenticated, isAuthorized } from "../middleware/auth";
import {
  getMyNotifications,
  getAllNotifications,
  markAsRead,
  broadcastNotification,
  notifySingleUser,
  notifyUserGroup,
  notifyByCriteria,
} from "../controllers/notificationController";

const router = Router();

/* =========================================================
   USER ROUTES
========================================================= */

// Get my notifications
router.get("/my", isAuthenticated, getMyNotifications);

// Mark notification as read
router.patch("/mark/:id/read", isAuthenticated, markAsRead);

/* =========================================================
   ADMIN / SUPER ADMIN ROUTES
========================================================= */

// View all notifications
router.get(
  "/all",
  isAuthenticated,
  isAuthorized("Admin", "SuperAdmin"),
  getAllNotifications
);

/* =========================================================
   SUPER ADMIN ROUTES
========================================================= */

// Broadcast to all users
router.post(
  "/broadcast",
  isAuthenticated,
  isAuthorized("SuperAdmin"),
  broadcastNotification
);

// Send to single user
router.post(
  "/send/user",
  isAuthenticated,
  isAuthorized("SuperAdmin"),
  notifySingleUser
);

// Send to group of users
router.post(
  "/send/group",
  isAuthenticated,
  isAuthorized("SuperAdmin"),
  notifyUserGroup
);

// Send by role / department
router.post(
  "/send/criteria",
  isAuthenticated,
  isAuthorized("SuperAdmin"),
  notifyByCriteria
);

export default router;
