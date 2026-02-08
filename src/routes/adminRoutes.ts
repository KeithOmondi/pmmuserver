// src/routes/adminRoutes.ts
import express from "express";
import { getLiveActivityFeed, clearActivityFeed, getOnlineUsers } from "../controllers/adminController";
import { isAuthenticated, isAuthorized } from "../middleware/auth";

const router = express.Router();



// Only SuperAdmin should see the live system logs
router.route("/activity-feed")
  .get(isAuthenticated, isAuthorized("SuperAdmin"), getLiveActivityFeed);

router.route("/activity-feed/clear")
  .delete(isAuthenticated, isAuthorized("SuperAdmin"), clearActivityFeed);

  router.get(
  "/users/online-users",
  isAuthenticated,
  isAuthorized("SuperAdmin"),
  getOnlineUsers
);


export default router;