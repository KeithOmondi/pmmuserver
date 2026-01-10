import express from "express";
import {
  getReportHtml,
  getReportPdf,
  getReportHtmlById,
  getReportPdfById,
} from "../controllers/reportsController";
import { isAuthenticated, isAuthorized } from "../middleware/auth";

const router = express.Router();

/* ============================================================
   ADMIN / SUPERADMIN ROUTES (Global Access)
============================================================ */

/**
 * @desc Generate Global Executive Reports (PDF)
 * @access Private (Admin, SuperAdmin)
 */
router.get(
  "/admin/get/pdf",
  isAuthenticated,
  // UPDATED: Match the PascalCase roles from your IUser model
  isAuthorized("Admin", "SuperAdmin"), 
  getReportPdf
);

/**
 * @desc Preview Global Executive Reports (HTML)
 * @access Private (Admin, SuperAdmin)
 */
router.get(
  "/admin/get/html",
  isAuthenticated,
  // UPDATED: Match the PascalCase roles from your IUser model
  isAuthorized("Admin", "SuperAdmin"),
  getReportHtml
);

/* ============================================================
   STANDARD USER ROUTES (Self-Access Only)
============================================================ */

router.get("/userpdf/pdf", isAuthenticated, getReportPdf);
router.get("/userhtml/html", isAuthenticated, getReportHtml);

/* ============================================================
   INDICATOR-SPECIFIC REPORTS (By ID)
============================================================ */

router.get("/getpdf/pdf/:id", isAuthenticated, getReportPdfById);
router.get("/gethtml/html/:id", isAuthenticated, getReportHtmlById);

export default router;