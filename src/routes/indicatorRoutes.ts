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
  adminSubmitIndicatorEvidence,
  proxyEvidenceStream,
  resubmitIndicatorEvidence,
  submitIndicatorScore,
  deleteSingleEvidence,
  updateEvidenceDescription,
} from "../controllers/indicatorController";
import { isAuthenticated, isAuthorized } from "../middleware/auth";
import { upload } from "../middleware/multer";

const router = express.Router();

/* ================================================
   1. STATIC ROUTES (Must come before /:id)
   ================================================ */

router.get("/my", isAuthenticated, getUserIndicators);

router.get(
  "/submitted",
  isAuthenticated,
  isAuthorized("superadmin", "admin"),
  getSubmittedIndicators
);

router.get(
  "/all",
  isAuthenticated,
  isAuthorized("superadmin", "admin"),
  getAllIndicators
);

/* ================================================
   2. CORE CRUD & ACTION ROUTES
   ================================================ */

router.post(
  "/create",
  isAuthenticated,
  isAuthorized("superadmin"),
  createIndicator
);

router.get("/get/:id", isAuthenticated, getIndicatorById);

router.put(
  "/update/:id",
  isAuthenticated,
  isAuthorized("superadmin", "admin"),
  updateIndicator
);

router.delete(
  "/delete/:id",
  isAuthenticated,
  isAuthorized("superadmin"),
  deleteIndicator
);

/* ================================================
   3. EVIDENCE & SUBMISSION MANAGEMENT
   ================================================ */

// Standard User Submission
router.post(
  "/submit/:id",
  isAuthenticated,
  upload.array("files", 100),
  submitIndicatorEvidence
);

// User Resubmission (Post-Rejection)
router.post(
  "/resubmit/:id",
  isAuthenticated,
  upload.array("files", 100), 
  resubmitIndicatorEvidence
);

// Admin Direct Upload (Auto-approve)
router.post(
  "/:id/admin-submit",
  isAuthenticated,
  isAuthorized("admin", "superadmin"),
  upload.array("files", 10),
  adminSubmitIndicatorEvidence
);


// Delete single evidence (User-only ownership verified in controller)
router.delete(
  "/:id/evidence/:evidenceId",
  isAuthenticated,
  deleteSingleEvidence
);

// Update evidence description
router.patch(
  "/:id/evidence/:evidenceId/description",
  isAuthenticated,
  isAuthorized("admin", "superadmin"),
  updateEvidenceDescription
);

/* ================================================
   4. REVIEW & SCORING
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

router.post(
  "/submit-score/:id",
  isAuthenticated,
  isAuthorized("admin", "superadmin"),
  submitIndicatorScore
);

/* ================================================
   5. UTILITY / PROXY
   ================================================ */

router.get(
  "/:id/proxy-evidence", // Changed :indicatorId to :id for consistency
  isAuthenticated,
  proxyEvidenceStream
);

export default router;