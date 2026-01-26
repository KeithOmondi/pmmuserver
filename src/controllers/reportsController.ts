import { Request, Response } from "express";
import puppeteer, { Browser } from "puppeteer";
import { Indicator } from "../models/Indicator";
import { Types } from "mongoose";
import { UserDocument } from "../models/User";

/* ============================================================
    QUERY BUILDER
============================================================ */
const buildIndicatorQuery = (req: Request) => {
  const user = req.user as UserDocument;
  if (!user) throw new Error("Unauthorized");

  const query: Record<string, any> = {};
  const userRole = user.role.toLowerCase();
  const isAdmin = userRole === "admin" || userRole === "superadmin";

  const type = (req.query.type as string | undefined)?.toLowerCase().trim();
  const rawUserId = req.query.userId as string;

  if (!isAdmin) {
    query.$or = [
      { assignedTo: user._id },
      { assignedGroup: { $in: [user._id] } },
    ];
  } else if (
    rawUserId &&
    rawUserId !== "undefined" &&
    Types.ObjectId.isValid(rawUserId)
  ) {
    const targetId = new Types.ObjectId(rawUserId);
    query.$or = [
      { assignedTo: targetId },
      { assignedGroup: { $in: [targetId] } },
    ];
  }

  const now = new Date();

  switch (type) {
    case "single":
      if (Types.ObjectId.isValid(req.query.id as string)) {
        query._id = new Types.ObjectId(req.query.id as string);
      }
      break;
    case "weekly": {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setDate(now.getDate() + 7);
      end.setHours(23, 59, 59, 999);
      query.dueDate = { $gte: start, $lte: end };
      break;
    }
    case "monthly": {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
      );
      query.dueDate = { $gte: startOfMonth, $lte: endOfMonth };
      break;
    }
    case "group":
      query.assignedToType = "group";
      break;
  }
  return query;
};

/* ============================================================
    HTML TEMPLATE (JUDICIAL DESIGN)
============================================================ */
const formatIndicatorsForHtml = (
  indicators: any[],
  title: string,
  user: UserDocument,
): string => {
  const dateLabel = new Date().toLocaleString("en-KE");
  // Official Placeholder for Judiciary Logo (Use a public URL to your hosted logo)
  const LOGO_URL =
    "https://res.cloudinary.com/drls2cpnu/image/upload/v1765116373/The_Jud_rmzqa7.png";

  const rows = indicators.map((i) => {
    let responsible = "Unassigned";
    if (i.assignedToType === "individual" && i.assignedTo) {
      responsible = `${i.assignedTo.name || "Unknown"} (PJ: ${
        i.assignedTo.pjNumber || "N/A"
      })`;
    } else if (i.assignedGroup && i.assignedGroup.length > 0) {
      responsible = i.assignedGroup
        .map((u: any) => u.name || u.pjNumber)
        .join(", ");
    }

    return `
      <tr>
        <td style="font-weight: bold; color: #1a3a32;">${
          i.indicatorTitle || "Untitled"
        }</td>
        <td>${i.category?.title ?? "General"}</td>
        <td>${responsible}</td>
        <td><span class="status-badge">${(
          i.status || "N/A"
        ).toUpperCase()}</span></td>
        <td style="font-weight: bold;">${i.progress || 0}%</td>
        <td>${
          i.dueDate
            ? new Date(i.dueDate).toLocaleDateString("en-GB")
            : "No Date"
        }</td>
      </tr>
    `;
  });

  return `
<!DOCTYPE html>
<html>
<head>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: 'Times New Roman', serif; padding: 20px; color: #1a1a1a; line-height: 1.4; background: #fff; }
  
  /* Top Golden Border */
  .top-accent { height: 8px; background: #c2a336; margin-bottom: 20px; border-radius: 4px; }
  
  .header-table { width: 100%; border-bottom: 4px solid #1a3a32; padding-bottom: 15px; margin-bottom: 20px; }
  .logo { width: 100px; height: auto; }
  
  h1 { margin: 0; color: #1a3a32; font-size: 32px; letter-spacing: -1px; text-transform: uppercase; font-weight: 900; }
  .report-title { color: #c2a336; font-size: 18px; font-weight: bold; margin-top: 5px; text-transform: uppercase; letter-spacing: 2px; }
  
  .meta-box { background: #f9f9f9; padding: 15px; border-left: 5px solid #c2a336; margin-bottom: 20px; font-size: 14px; }
  .meta-box strong { color: #1a3a32; }

  table { width: 100%; border-collapse: collapse; margin-top: 20px; table-layout: fixed; border: 1px solid #1a3a32; }
  th { background: #1a3a32; color: #ffffff; padding: 15px; font-size: 13px; text-align: left; text-transform: uppercase; border: 1px solid #1a3a32; }
  td { padding: 12px; border: 1px solid #d1d1d1; font-size: 13px; text-align: left; word-wrap: break-word; }
  
  tr:nth-child(even) { background: #f2f4f3; }
  
  .status-badge { background: #e8eceb; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; color: #1a3a32; border: 1px solid #1a3a32; }
  .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #666; border-top: 1px solid #eee; padding-top: 10px; }
  .no-data { text-align: center; padding: 60px; color: #999; font-style: italic; font-size: 16px; }
</style>
</head>
<body>
  <div class="top-accent"></div>
  
 <table class="header-table" style="border:none; width: 100%; border-collapse: collapse; background: none;">
  <tr style="background:none;">
    <td style="border:none; width: 120px; padding: 0;">
      <img src="${LOGO_URL}" class="logo" style="display: block; width: 100px;">
    </td>

    <td style="border:none; vertical-align: middle; text-align: left; padding-left: 10px;">
      <h1 style="
        margin: 0; 
        padding: 0; 
        white-space: nowrap; 
        font-family: 'Playfair Display', serif; 
        font-size: 22px; 
        color: #1E3A2B; 
        text-transform: uppercase; 
        letter-spacing: 0.5px;
      ">
        OFFICE OF THE REGISTRAR HIGH COURT
      </h1>
      <div class="report-title" style="
        color: #C69214; 
        font-weight: bold; 
        font-size: 14px; 
        text-transform: uppercase; 
        margin-top: 4px;
      ">
        Performance Management and Measurement
      </div>
    </td>

    <td style="border:none; text-align: right; vertical-align: bottom; width: 120px;">
      <div style="font-size: 11px; font-weight: 800; color: #1E3A2B; opacity: 0.8; font-family: sans-serif;">
        FORM J-PR-01
      </div>
    </td>
  </tr>
</table>

  <div class="meta-box">
    <table style="width: 100%; border: none; background: transparent;">
      
       <tr style="background:none;"><td style="border:none; padding: 2px;"><strong>GENERATED BY:</strong> ${
         user.name?.toUpperCase() || "SYSTEM"
       } (PJ: ${user.pjNumber || "N/A"})</td></tr>
       <tr style="background:none;"><td style="border:none; padding: 2px;"><strong>DATE OF ISSUE:</strong> ${dateLabel}</td></tr>
    </table>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Indicator Description</th>
        <th style="width: 15%;">Unit/Category</th>
        <th style="width: 25%;">Responsible Officer</th>
        <th style="width: 14%;">Status</th>
        <th style="width: 10%;">Score (%)</th>
        <th style="width: 13%;">Deadline</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rows.join("")
          : `<tr><td colspan="6" class="no-data">No formal records found matching the criteria in the Judicial Registry.</td></tr>`
      }
    </tbody>
  </table>

  <div class="footer">
    This is an officially generated report from the Judiciary Performance Management System. &copy; ${new Date().getFullYear()} Republic of Kenya.
  </div>
</body>
</html>
`;
};

/* ============================================================
    PUPPETEER BROWSER MANAGEMENT
============================================================ */
let browserInstance: Browser | null = null;
const getBrowser = async () => {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }
  return browserInstance;
};

/* ============================================================
    CONTROLLERS
============================================================ */
export const getReportPdf = async (req: Request, res: Response) => {
  if (!req.user) return res.sendStatus(401);
  let page;
  try {
    const query = buildIndicatorQuery(req);
    const indicators = await Indicator.find(query)
      .populate("category", "title")
      .populate("assignedTo", "name pjNumber")
      .populate("assignedGroup", "name pjNumber")
      .lean();

    const html = formatIndicatorsForHtml(
      indicators,
      `${req.query.type?.toString().toUpperCase() || "GENERAL"} AUDIT REPORT`,
      req.user as UserDocument,
    );
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    });
    res.contentType("application/pdf").send(pdf);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (page) await page.close();
  }
};

export const getReportHtml = async (req: Request, res: Response) => {
  if (!req.user) return res.sendStatus(401);
  try {
    const query = buildIndicatorQuery(req);
    const indicators = await Indicator.find(query)
      .populate("category", "title")
      .populate("assignedTo", "name pjNumber")
      .populate("assignedGroup", "name pjNumber")
      .lean();
    const html = formatIndicatorsForHtml(
      indicators,
      `${req.query.type || "GENERAL"} PREVIEW`,
      req.user as UserDocument,
    );
    res.status(200).send(html);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * SINGLE INDICATOR PDF BY ID
 */
export const getReportPdfById = async (req: Request, res: Response) => {
  if (!req.user)
    return res.status(401).json({ success: false, message: "Unauthorized" });
  const { id } = req.params;
  let page;
  try {
    const user = req.user as UserDocument;
    // Build query using ID and access rules
    const query: any = { _id: new Types.ObjectId(id) };
    if (user.role !== "Admin" && user.role !== "SuperAdmin") {
      query.$or = [
        { assignedTo: user._id },
        { assignedGroup: { $in: [user._id] } },
      ];
    }

    const indicator = await Indicator.findOne(query)
      .populate("category", "title")
      .populate("assignedTo", "name pjNumber")
      .populate("assignedGroup", "name pjNumber")
      .lean();

    if (!indicator)
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });

    const html = formatIndicatorsForHtml(
      [indicator],
      "Individual Record Audit",
      user,
    );
    const instance = await getBrowser();
    page = await instance.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({ format: "A4", printBackground: true });
    res.contentType("application/pdf").send(pdf);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (page) await page.close();
  }
};

/**
 * SINGLE INDICATOR HTML BY ID
 */
export const getReportHtmlById = async (req: Request, res: Response) => {
  if (!req.user)
    return res.status(401).json({ success: false, message: "Unauthorized" });
  const { id } = req.params;
  try {
    const user = req.user as UserDocument;
    const query: any = { _id: new Types.ObjectId(id) };
    if (user.role !== "Admin" && user.role !== "SuperAdmin") {
      query.$or = [
        { assignedTo: user._id },
        { assignedGroup: { $in: [user._id] } },
      ];
    }

    const indicator = await Indicator.findOne(query)
      .populate("category", "title")
      .populate("assignedTo", "name pjNumber")
      .populate("assignedGroup", "name pjNumber")
      .lean();

    if (!indicator)
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });

    const html = formatIndicatorsForHtml(
      [indicator],
      "Individual Preview",
      user,
    );
    res.status(200).send(html);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
