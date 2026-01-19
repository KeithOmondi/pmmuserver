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
  downloadEvidence,
  getSubmittedIndicators,
  updateIndicatorProgress,
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
  isAuthorized("superadmin", "admin"),
  updateIndicator
);

/* ================================================
   USER: SUBMIT EVIDENCE (multiple files)
================================================ */
router.post(
  "/submit/:id",
  isAuthenticated,
  upload.fields([
  { name: "files", maxCount: 10 },
  { name: "descriptions", maxCount: 10 },
]),
  submitIndicatorEvidence
);

/* =====================================
   DOWNLOAD EVIDENCE (SIGNED URL)
===================================== */
// Express Router
router.get(
  "/:indicatorId/evidence/:publicId/download", // Added :indicatorId prefix
  isAuthenticated,
  downloadEvidence
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
  isAuthorized("superadmin", "admin"),
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

export default router;
