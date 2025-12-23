// controllers/reportsController.ts
import { Request, Response } from "express";
import { Indicator } from "../models/Indicator";
import puppeteer from "puppeteer";

// --- Helper to format indicators as HTML ---
const formatIndicatorsForHtml = (indicators: any[], reportType: string) => {
  const now = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const total = indicators.length;
  const completed = indicators.filter((i) => i.progress === 100).length;
  const pending = indicators.filter((i) => i.status === "pending").length;

  const rows = indicators
    .map(
      (i) => `
    <tr>
      <td>
        <div class="indicator-title">${i.indicatorTitle}</div>
        <div class="subcategory">${
          i.level2Category?.title || "Standard Registry"
        }</div>
      </td>
      <td>${i.category?.title || "-"}</td>
      <td>
        <span class="badge ${i.assignedToType}">
          ${
            i.assignedToType === "individual"
              ? i.assignedTo || "Unassigned"
              : "Group Body"
          }
        </span>
      </td>
      <td><span class="status-${i.status}">${i.status.toUpperCase()}</span></td>
      <td class="progress-cell">
        <div class="progress-text">${i.progress}%</div>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${
          i.progress
        }%"></div></div>
      </td>
      <td class="date-text">${new Date(i.dueDate).toLocaleDateString()}</td>
    </tr>
  `
    )
    .join("\n");

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <title>Judiciary Strategic Report</title>
      <style>
        @page { size: A4 landscape; margin: 1cm; }
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; line-height: 1.4; }
        .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1a3a32; padding-bottom: 20px; margin-bottom: 30px; }
        .logo-box img { height: 80px; width: auto; }
        .report-meta { text-align: right; }
        .report-meta h1 { margin: 0; color: #1a3a32; font-size: 24px; text-transform: uppercase; letter-spacing: 2px; }
        .report-meta p { margin: 5px 0 0; color: #c2a336; font-weight: bold; font-size: 12px; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
        .stat-card { border: 1px solid #e0e0e0; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-card .label { font-size: 10px; font-weight: 800; color: #8c94a4; text-transform: uppercase; margin-bottom: 5px; }
        .stat-card .value { font-size: 20px; font-weight: 800; color: #1a3a32; }
        table { border-collapse: collapse; width: 100%; }
        th { background-color: #1a3a32; color: #ffffff; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; padding: 12px 8px; text-align: left; }
        td { border-bottom: 1px solid #eee; padding: 12px 8px; font-size: 11px; vertical-align: middle; }
        .indicator-title { font-weight: bold; color: #1a3a32; font-size: 12px; }
        .subcategory { color: #8c94a4; font-size: 10px; margin-top: 2px; }
        .date-text { color: #444; font-family: monospace; }
        .status-approved { color: #2e7d32; font-weight: 800; }
        .status-pending { color: #ed6c02; font-weight: 800; }
        .status-rejected { color: #d32f2f; font-weight: 800; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; }
        .individual { background: #f4f0e6; color: #c2a336; }
        .group { background: #e3f2fd; color: #1976d2; }
        .progress-cell { width: 100px; }
        .progress-text { font-weight: bold; margin-bottom: 3px; }
        .progress-bar-bg { background: #eee; height: 6px; border-radius: 3px; width: 80px; }
        .progress-bar-fill { background: #1a3a32; height: 100%; border-radius: 3px; }
      </style>
    </head>
    <body>
      <div class="header-container">
        <div class="logo-box">
           <img src="https://res.cloudinary.com/drls2cpnu/image/upload/v1765116373/The_Jud_rmzqa7.png" alt="Judiciary Logo">
        </div>
        <div class="report-meta">
          <h1>Strategic Performance Dossier</h1>
          <p>Report Type: ${reportType.toUpperCase()} | Generated: ${now}</p>
        </div>
      </div>
      <div class="summary-grid">
        <div class="stat-card"><div class="label">Total Indicators</div><div class="value">${total}</div></div>
        <div class="stat-card"><div class="label">Total Compliant</div><div class="value">${completed}</div></div>
        <div class="stat-card"><div class="label">Awaiting Review</div><div class="value">${pending}</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Indicator Description</th>
            <th>Category</th>
            <th>Responsible Party</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Deadline</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </body>
  </html>
  `;
};

// --- GET /reports/pdf?type=weekly|monthly|single&id=xyz&group=abc ---
export const getReportPdf = async (req: Request, res: Response) => {
  try {
    const { type, id, group } = req.query;
    let indicators: any[] = [];

    if (type === "single" && id) {
      indicators = await Indicator.find({ _id: id }).populate(
        "category level2Category"
      );
    } else if (type === "group" && group) {
      indicators = await Indicator.find({ assignedGroup: group }).populate(
        "category level2Category"
      );
    } else if (type === "weekly") {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      indicators = await Indicator.find({
        createdAt: { $gte: startOfWeek, $lte: endOfWeek },
      }).populate("category level2Category");
    } else if (type === "quarterly") {
      const now = new Date();
      const startMonth = Math.floor(now.getMonth() / 3) * 3;
      const startOfQuarter = new Date(now.getFullYear(), startMonth, 1);
      const endOfQuarter = new Date(now.getFullYear(), startMonth + 3, 0);

      indicators = await Indicator.find({
        createdAt: { $gte: startOfQuarter, $lte: endOfQuarter },
      }).populate("category level2Category");
    } else {
      indicators = await Indicator.find({}).populate("category level2Category");
    }

    const html = formatIndicatorsForHtml(
      indicators,
      (type as string) || "general"
    );

    // Launch Puppeteer to generate PDF
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", landscape: true, printBackground: true });
    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=Strategic_Report_${type || "general"}.pdf`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to generate PDF report");
  }
};


// --- Exported function to render HTML ---
export const getReportHtml = async (req: Request, res: Response) => {
  try {
    const { type, id, group } = req.query;
    let indicators: any[] = [];

    if (type === "single" && id) {
      indicators = await Indicator.find({ _id: id }).populate(
        "category level2Category"
      );
    } else if (type === "group" && group) {
      indicators = await Indicator.find({ assignedGroup: group }).populate(
        "category level2Category"
      );
    } else if (type === "weekly") {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      indicators = await Indicator.find({
        createdAt: { $gte: startOfWeek, $lte: endOfWeek },
      }).populate("category level2Category");
    } else if (type === "quarterly") {
      const now = new Date();
      const startMonth = Math.floor(now.getMonth() / 3) * 3;
      const startOfQuarter = new Date(now.getFullYear(), startMonth, 1);
      const endOfQuarter = new Date(now.getFullYear(), startMonth + 3, 0);

      indicators = await Indicator.find({
        createdAt: { $gte: startOfQuarter, $lte: endOfQuarter },
      }).populate("category level2Category");
    } else {
      indicators = await Indicator.find({}).populate("category level2Category");
    }

    const html = formatIndicatorsForHtml(indicators, (type as string) || "general");

    res.header("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to generate report");
  }
};