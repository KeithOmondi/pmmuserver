import { Request, Response } from "express";
import puppeteer, { Browser } from "puppeteer";
import { Indicator } from "../models/Indicator";
import { Types } from "mongoose";
import { UserDocument } from "../models/User";

/* ============================================================
    QUERY BUILDER (HARDENED FOR DATA TYPES)
============================================================ */
const buildIndicatorQuery = (req: Request) => {
  const user = req.user as UserDocument;
  if (!user) throw new Error("Unauthorized");

  const query: Record<string, any> = {};
  
  // FIX 1: Case-insensitive role check
  const userRole = user.role.toLowerCase();
  const isAdmin = userRole === "admin" || userRole === "superadmin";

  const type = (req.query.type as string | undefined)?.toLowerCase().trim();
  const rawUserId = req.query.userId as string;

  /* ---------------------------
      ACCESS CONTROL
  ---------------------------- */
  if (!isAdmin) {
    // Regular users only see what is assigned to them
    query.$or = [
      { assignedTo: user._id },
      { assignedGroup: { $in: [user._id] } },
    ];
  } else if (rawUserId && rawUserId !== "undefined" && Types.ObjectId.isValid(rawUserId)) {
    // Admin filtering for a specific user
    const targetId = new Types.ObjectId(rawUserId);
    query.$or = [
      { assignedTo: targetId },
      { assignedGroup: { $in: [targetId] } },
    ];
  }
  // If Admin and NO rawUserId, the query object remains empty {}, 
  // which correctly fetches EVERYTHING.

  /* ---------------------------
      DATE FILTERING
  ---------------------------- */
  const now = new Date();
  
  switch (type) {
    case "single":
      if (Types.ObjectId.isValid(req.query.id as string)) {
        query._id = new Types.ObjectId(req.query.id as string);
      }
      break;

    case "weekly": {
      // Create a clean 14-day window around today
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0,0,0,0);
      
      const end = new Date(now);
      end.setDate(now.getDate() + 7);
      end.setHours(23,59,59,999);
      
      query.dueDate = { $gte: start, $lte: end };
      break;
    }

    case "monthly": {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      query.dueDate = { $gte: startOfMonth, $lte: endOfMonth };
      break;
    }

    case "group":
      query.assignedToType = "group";
      break;

    case "general":
    default:
      // If "general" is selected, we remove date constraints to see all data
      break;
  }

  return query;
};

/* ============================================================
    HTML TEMPLATE (IMPROVED DATA HANDLING)
============================================================ */
const formatIndicatorsForHtml = (
  indicators: any[],
  title: string,
  user: UserDocument
): string => {
  const dateLabel = new Date().toLocaleString("en-KE");

  const rows = indicators.map((i) => {
    // Robust responsible party detection
    let responsible = "Unassigned";
    if (i.assignedToType === "individual" && i.assignedTo) {
      responsible = `${i.assignedTo.name || 'Unknown'} (PJ: ${i.assignedTo.pjNumber || 'N/A'})`;
    } else if (i.assignedGroup && i.assignedGroup.length > 0) {
      responsible = i.assignedGroup.map((u: any) => u.name || u.pjNumber).join(", ");
    }

    return `
      <tr>
        <td>${i.indicatorTitle || "Untitled"}</td>
        <td>${i.category?.title ?? "General"}</td>
        <td>${responsible}</td>
        <td>${(i.status || "N/A").toUpperCase()}</td>
        <td>${i.progress || 0}%</td>
        <td>${i.dueDate ? new Date(i.dueDate).toLocaleDateString("en-GB") : "No Date"}</td>
      </tr>
    `;
  });

  return `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.5; }
  .header-container { border-bottom: 3px solid #1E3A2B; margin-bottom: 20px; padding-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; table-layout: fixed; }
  th, td { padding: 12px; border: 1px solid #e0e0e0; font-size: 10px; text-align: left; word-wrap: break-word; }
  th { background: #1E3A2B; color: #ffffff; text-transform: uppercase; }
  h1 { margin: 0; color: #1E3A2B; font-size: 24px; }
  .meta { font-size: 11px; margin-top: 10px; color: #444; }
  .no-data { text-align: center; padding: 60px; color: #999; font-style: italic; font-size: 14px; }
</style>
</head>
<body>
  <div class="header-container">
    <h1>JUDICIARY PERFORMANCE SYSTEM</h1>
    <div class="meta">
      <strong>AUDIT TYPE:</strong> ${title}<br/>
      <strong>OFFICER:</strong> ${user.name || 'System User'} | <strong>PJ:</strong> ${user.pjNumber || 'N/A'}<br/>
      <strong>TIMESTAMP:</strong> ${dateLabel}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Indicator</th>
        <th style="width: 15%;">Category</th>
        <th style="width: 25%;">Responsibility</th>
        <th style="width: 12%;">Status</th>
        <th style="width: 10%;">Progress</th>
        <th style="width: 13%;">Due Date</th>
      </tr>
    </thead>
    <tbody>
      ${rows.length ? rows.join("") : `<tr><td colspan="6" class="no-data">No records found matching the criteria in the Judicial Database.</td></tr>`}
    </tbody>
  </table>
</body>
</html>
`;
};

/* ============================================================
    PUPPETEER & CONTROLLERS (UNCHANGED LOGIC)
============================================================ */
let browserInstance: Browser | null = null;
const getBrowser = async () => {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserInstance;
};

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

    const html = formatIndicatorsForHtml(indicators, `${req.query.type?.toString().toUpperCase() || "GENERAL"} REPORT`, req.user as UserDocument);
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true });
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
    const html = formatIndicatorsForHtml(indicators, `${req.query.type || "GENERAL"} PREVIEW`, req.user as UserDocument);
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
      user
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
      user
    );
    res.status(200).send(html);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
