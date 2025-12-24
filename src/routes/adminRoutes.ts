// src/routes/adminRoutes.ts
import express from "express";
import { getLiveActivityFeed, clearActivityFeed } from "../controllers/adminController";
import { isAuthenticated, isAuthorized } from "../middleware/auth";

const router = express.Router();



// Only SuperAdmin should see the live system logs
router.route("/activity-feed")
  .get(isAuthenticated, isAuthorized("SuperAdmin"), getLiveActivityFeed);

router.route("/activity-feed/clear")
  .delete(isAuthenticated, isAuthorized("SuperAdmin"), clearActivityFeed);

export default router;