import express from "express";
import { getReportHtml, getReportPdf } from "../controllers/reportsController";
import { isAuthenticated } from "../middleware/auth";

const router = express.Router();

/**
 * REPORTING ENDPOINTS
 * * Logic Summary:
 * 1. isAuthenticated: Ensures the user is logged in (populates req.user).
 * 2. Controller Logic: 
 * - If Admin/SuperAdmin: Fetches all data (General Report).
 * - If User: Automatically filters query to show only their assignments.
 */

// HTML preview for browser
router.get(
  "/html", 
  isAuthenticated, 
  getReportHtml
);

// PDF generation for download
router.get(
  "/pdf", 
  isAuthenticated, 
  getReportPdf
);

/**
 * OPTIONAL: Specific Admin-Only Route
 * If you ever need a report that ONLY Admins can even attempt to trigger
 */
// router.get(
//   "/admin-audit", 
//   isAuthenticated, 
//   isAuthorized("SuperAdmin", "Admin"), 
//   getAdminAuditPdf
// );

export default router;