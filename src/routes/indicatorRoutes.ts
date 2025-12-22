// routes/indicatorRoutes.ts
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
  isAuthorized("SuperAdmin"),
  createIndicator
);

/* ================================================
   SUPERADMIN / ADMIN: UPDATE INDICATOR
================================================ */
router.put(
  "/update/:id",
  isAuthenticated,
  isAuthorized("SuperAdmin", "Admin"),
  updateIndicator
);

/* ================================================
   USER: SUBMIT EVIDENCE
================================================ */
router.post(
  "/submit/:id",
  isAuthenticated,
  upload.array("evidence"),
  submitIndicatorEvidence
);

/* ================================================
   USER: GET MY ASSIGNED INDICATORS
================================================ */
router.get("/my", isAuthenticated, getUserIndicators);

/* ================================================
   GET SINGLE INDICATOR
================================================ */
router.get("/get/:id", isAuthenticated, getIndicatorById);

/*============================
GET ALL INDICATORS
===============================*/
router.get("/all", isAuthenticated, isAuthorized("superAdmin", "Admin"), getAllIndicators);

/* ================================================
   DELETE INDICATOR
================================================ */
router.delete("/delete/:id", isAuthenticated, isAuthorized("superAdmin", "Admin"), deleteIndicator);

/* ================================================
   GET ALL INDICATORS
================================================ 
router.get("/all", isAuthenticated, isAuthorized("SuperAdmin", "Admin"), getAllIndicatorsForAdmin);  */

/* ================================================
   APPROVE / REJECT INDICATOR
================================================ */
router.put(
  "/approve/:id",
  isAuthenticated,
  isAuthorized("superAdmin", "Admin"),
  approveIndicator
);
router.put(
  "/reject/:id",
  isAuthenticated,
  isAuthorized("superAdmin", "Admin"),
  rejectIndicator
);

export default router;
