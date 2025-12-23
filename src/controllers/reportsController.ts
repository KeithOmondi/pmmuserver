import { Request, Response } from "express";
import { Indicator } from "../models/Indicator";
import puppeteer from "puppeteer";

/**
 * Builds the query with strict Role-Based Access Control (RBAC).
 * Ensures standard users can NEVER access the full registry.
 */
const buildIndicatorQuery = (req: Request) => {
  const { type, id, group } = req.query;
  const user = req.user;
  const query: any = {};

  const isAdmin = user?.role === "Admin" || user?.role === "SuperAdmin";

  // 1. DATA ACCESS CONTROL
  if (!isAdmin) {
    // Standard Users: Always hard-limit to their assigned records
    // regardless of the "type" they sent in the request.
    query.$or = [{ assignedTo: user?._id }, { assignedGroup: user?._id }];
  } else {
    // Admins/SuperAdmins: Can filter by specific ID or Group
    if (type === "single" && id) {
      query._id = id;
    } else if (type === "group" && group) {
      query.assignedGroup = group;
    }
    // Note: If type is 'general', query remains {} (fetches all)
  }

  // 2. TIME FILTERS (Applies to both roles, within their allowed scope)
  if (type === "weekly") {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    query.createdAt = { $gte: start };
  } else if (type === "quarterly") {
    const now = new Date();
    const startMonth = Math.floor(now.getMonth() / 3) * 3;
    const startOfQuarter = new Date(now.getFullYear(), startMonth, 1);
    query.createdAt = { $gte: startOfQuarter };
  }

  return query;
};

const formatIndicatorsForHtml = (
  indicators: any[],
  reportType: string,
  role: string
) => {
  const now = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Access Scope Label for the PDF header
  const accessLabel =
    role === "Admin" || role === "SuperAdmin"
      ? "GLOBAL REGISTRY VIEW"
      : "PERSONAL ASSIGNMENT VIEW";

  const rows = indicators
    .map((i) => {
      let responsibleParty = "Unassigned";

      if (i.assignedToType === "individual" && i.assignedTo) {
        responsibleParty =
          i.assignedTo.username || i.assignedTo.name || "Unknown User";
      } else if (i.assignedToType === "group" && i.assignedGroup?.length > 0) {
        responsibleParty = i.assignedGroup
          .map((u: any) => u.username || u.name || "Unknown")
          .join(", ");
      }

      return `
    <tr>
      <td>
        <div class="indicator-title">${i.indicatorTitle}</div>
        <div class="subcategory">${
          i.level2Category?.title || "Standard Registry"
        }</div>
      </td>
      <td>${i.category?.title || "N/A"}</td>
      <td><span class="badge ${
        i.assignedToType
      }">${responsibleParty}</span></td>
      <td><span class="status-${i.status?.toLowerCase()}">${(
        i.status || "pending"
      ).toUpperCase()}</span></td>
      <td class="progress-cell">
        <div class="progress-text">${i.progress || 0}%</div>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${
          i.progress || 0
        }%"></div></div>
      </td>
      <td class="date-text">${
        i.dueDate ? new Date(i.dueDate).toLocaleDateString() : "-"
      }</td>
    </tr>`;
    })
    .join("");

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <style>
        @page { size: A4 landscape; margin: 1cm; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; margin: 0; padding: 0; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1a3a32; padding-bottom: 15px; margin-bottom: 25px; }
        .logo { height: 70px; }
        .report-info { text-align: right; }
        .report-info h1 { margin: 0; color: #1a3a32; font-size: 20px; text-transform: uppercase; }
        .report-info p { margin: 5px 0 0; color: #c2a336; font-weight: bold; font-size: 11px; }
        .access-tag { font-size: 9px; color: #888; letter-spacing: 1px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background-color: #1a3a32; color: #ffffff; text-transform: uppercase; font-size: 10px; padding: 12px; text-align: left; }
        td { padding: 12px; border-bottom: 1px solid #eee; font-size: 10px; vertical-align: middle; }
        .badge { padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 9px; }
        .individual { background: #fef3c7; color: #92400e; }
        .group { background: #dbeafe; color: #1e40af; }
        .status-approved { color: #059669; font-weight: 800; }
        .status-pending { color: #d97706; font-weight: 800; }
        .progress-bar-bg { background: #e5e7eb; height: 8px; border-radius: 4px; width: 80px; }
        .progress-bar-fill { background: #1a3a32; height: 100%; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="https://res.cloudinary.com/drls2cpnu/image/upload/v1765116373/The_Jud_rmzqa7.png" class="logo">
        <div class="report-info">
          <h1>ORHC Performance Report</h1>
          <p>${reportType.toUpperCase()} REPORT | ${now}</p>
          <div class="access-tag">${accessLabel}</div>
        </div>
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
        <tbody>${rows}</tbody>
      </table>
    </body>
  </html>`;
};

export const getReportPdf = async (req: Request, res: Response) => {
  try {
    const query = buildIndicatorQuery(req);
    const indicators = await Indicator.find(query)
      .populate("category level2Category")
      .populate("assignedTo", "username name")
      .populate("assignedGroup", "username name")
      .lean();

    const html = formatIndicatorsForHtml(
      indicators,
      (req.query.type as string) || "General",
      req.user?.role || "User"
    );

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
    });
    await browser.close();

    res.contentType("application/pdf").send(pdf);
  } catch (err) {
    res.status(500).json({ message: "PDF generation failed" });
  }
};

export const getReportHtml = async (req: Request, res: Response) => {
  try {
    const query = buildIndicatorQuery(req);
    const indicators = await Indicator.find(query)
      .populate("category level2Category")
      .populate("assignedTo", "username name")
      .populate("assignedGroup", "username name")
      .lean();

    const html = formatIndicatorsForHtml(
      indicators,
      (req.query.type as string) || "General",
      req.user?.role || "User"
    );
    res.send(html);
  } catch (err) {
    res.status(500).json({ message: "HTML preview failed" });
  }
};
