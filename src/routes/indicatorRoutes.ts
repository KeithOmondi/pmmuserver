import express from "express";
import {
  createIndicator,
  updateIndicator,
  deleteIndicator,
  getUserIndicators,
  getIndicatorById,
  submitIndicatorEvidence,
  approveIndicator,
  rejectIndicator,
  getAllIndicators,
  getSubmittedIndicators,
  updateIndicatorProgress,
  getEvidencePreviewUrl,
} from "../controllers/indicatorController";
import { isAuthenticated, isAuthorized } from "../middleware/auth";
import { upload } from "../middleware/multer";

const router = express.Router();

/* ================================================
   SUPERADMIN: CREATE INDICATOR
================================================ */
router.post(
  "/create",
  isAuthenticated,
  isAuthorized("superadmin"), // matches your controller role
  createIndicator
);

/* ================================================
   SUPERADMIN / ADMIN: UPDATE INDICATOR
================================================ */
router.put(
  "/update/:id",
  isAuthenticated,
  isAuthorized("superadmin"),
  updateIndicator
);


/* ================================================
   USER: SUBMIT EVIDENCE (multiple files)
================================================ */
router.post(
  "/submit/:id",
  isAuthenticated,
  // Use upload.array to target the "files" field specifically.
  // This handles the binary files and ignores the text "descriptions".
  upload.array("files", 100), 
  submitIndicatorEvidence
);

router.get("/submitted", isAuthenticated, isAuthorized("superadmin", "admin"), getSubmittedIndicators);

/* ================================================
   USER: GET MY ASSIGNED INDICATORS
================================================ */
router.get("/my", isAuthenticated, getUserIndicators);

/* ================================================
   GET SINGLE INDICATOR
================================================ */
router.get("/get/:id", isAuthenticated, getIndicatorById);

/* ================================================
   GET ALL INDICATORS (ADMIN ONLY)
================================================ */
router.get(
  "/all",
  isAuthenticated,
  isAuthorized("superadmin", "admin"),
  getAllIndicators
);

/* ================================================
   DELETE INDICATOR
================================================ */
router.delete(
  "/delete/:id",
  isAuthenticated,
  isAuthorized("superadmin"),
  deleteIndicator
);

/* ================================================
   APPROVE / REJECT INDICATOR
================================================ */
router.put(
  "/approve/:id",
  isAuthenticated,
  isAuthorized("superadmin", "admin"),
  approveIndicator
);

router.put(
  "/reject/:id",
  isAuthenticated,
  isAuthorized("superadmin", "admin"),
  rejectIndicator
);

router.patch(
  "/:id/progress",
  isAuthenticated,
  isAuthorized("admin", "superadmin"), 
  updateIndicatorProgress
);

/* =====================================================
   GET SIGNED EVIDENCE PREVIEW URL
   Route: /api/indicators/:indicatorId/evidence/:evidenceId/preview
   Method: GET
   Auth: Required
===================================================== */
router.get(
  "/:indicatorId/evidence/:evidenceId/preview",
  isAuthenticated, // ensures req.user exists
  getEvidencePreviewUrl
);

export default router;
