import express from "express";
import { getReportHtml, getReportPdf } from "../controllers/reportsController";

const router = express.Router();

// HTML report for browser
router.get("/html", getReportHtml);

// PDF report for download
router.get("/pdf", getReportPdf);

export default router;
