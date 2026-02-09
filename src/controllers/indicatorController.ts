import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import mongoose, { Types } from "mongoose";

import { Category, ICategory } from "../models/Category";
import { Indicator, IEvidence } from "../models/Indicator";
import { User } from "../models/User";

import { catchAsyncErrors } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../middleware/errorMiddlewares";

import {
  cloudinary,
  deleteFromCloudinary,
  getCachedResource,
  uploadToCloudinary,
} from "../utils/cloudinary";
import { logActivity } from "../utils/activityLogger";
import { notifyUser } from "../services/notification.service";
import sendMail from "../utils/sendMail";
import {
  indicatorApprovedTemplate,
  indicatorCreatedTemplate,
  indicatorRejectedTemplate,
} from "../utils/mailTemplates";
import { env } from "../config/env";
import {
  emitIndicatorUpdateToAdmins,
  emitIndicatorUpdateToUser,
} from "../sockets/socket";
import axios from "axios";

/* =====================================================
 STATUS
===================================================== */
export const STATUS = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  APPROVED: "approved", // Admin Approved
  COMPLETED: "completed", // Superadmin Approved
  REJECTED: "rejected",
  OVERDUE: "overdue",
} as const;

export type StatusType = (typeof STATUS)[keyof typeof STATUS];

/* =====================================================
 TYPES
===================================================== */
export type MinimalUser = {
  _id: Types.ObjectId;
  role?: string;
};

export type AuthenticatedRequest = Request & {
  user?: MinimalUser;
  files?: {
    files?: Express.Multer.File[];
  };
};

/* =====================================================
 HELPERS
===================================================== */
const hasRole = (role: string | undefined, allowed: string[]) =>
  !!role && allowed.map((r) => r.toLowerCase()).includes(role.toLowerCase());

const objectId = Joi.string().hex().length(24);

/* =====================================================
 JOI SCHEMA
===================================================== */
const createIndicatorSchema = Joi.object({
  categoryId: objectId.required(),
  level2CategoryId: objectId.required(),
  indicatorId: objectId.required(),
  unitOfMeasure: Joi.string().required(),
  assignedToType: Joi.string().valid("individual", "group").required(),
  assignedTo: objectId.allow(null).optional(),
  assignedGroup: Joi.array().items(objectId).optional(),
  startDate: Joi.date().required(),
  dueDate: Joi.date().greater(Joi.ref("startDate")).required(),
  calendarEvent: Joi.object().optional(),
}).custom((value, helpers) => {
  const hasIndividual = !!value.assignedTo;
  const hasGroup =
    Array.isArray(value.assignedGroup) && value.assignedGroup.length > 0;
  if (!hasIndividual && !hasGroup) {
    return helpers.error("any.custom", {
      message: "At least one assignee is required",
    });
  }
  return value;
});

/* =====================================================
 CATEGORY VALIDATION
===================================================== */
const validateCategories = async (categoryId: string, level2Id: string) => {
  const main = await Category.findById(categoryId).lean<ICategory>();
  if (!main || main.level !== 1)
    throw new ErrorHandler(400, "Invalid main category");

  const level2 = await Category.findById(level2Id).lean<ICategory>();
  if (!level2 || level2.level !== 2)
    throw new ErrorHandler(400, "Invalid level 2 category");

  if (String(level2.parent) !== String(main._id))
    throw new ErrorHandler(400, "Category hierarchy mismatch");
};

const resolveIndicatorTitle = async (indicatorId: string) => {
  const indicator = await Category.findById(indicatorId).lean<ICategory>();
  if (!indicator || indicator.level !== 3)
    throw new ErrorHandler(400, "Invalid indicator");
  return indicator.title;
};

/* =====================================================
 EVIDENCE BUILDER
===================================================== */
const buildEvidence = (
  upload: any,
  fileName: string,
  fileSize: number,
  mimeType: string,
  description = "",
  attempt = 0,
): IEvidence => {
  return {
    type: "file",
    fileName,
    fileSize,
    mimeType,
    description,

    // EXACT Cloudinary values — no guessing
    publicId: upload.public_id,
    resourceType: upload.resource_type, // 👈 image for PDFs
    cloudinaryType: upload.type, // authenticated
    format: upload.format, // pdf
    version: upload.version,

    status: "active",
    isArchived: false,
    isResubmission: attempt > 0,
    resubmissionAttempt: attempt,
    uploadedAt: new Date(),
  };
};

/* =====================================================
 CREATE INDICATOR
===================================================== */
export const createIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["superadmin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    if (req.body.assignedTo === "") delete req.body.assignedTo;
    if (!Array.isArray(req.body.assignedGroup)) req.body.assignedGroup = [];
    if (typeof req.body.assignedGroup === "string")
      req.body.assignedGroup = [req.body.assignedGroup];

    const { error, value } = createIndicatorSchema.validate(req.body, {
      stripUnknown: true,
    });
    if (error) return next(new ErrorHandler(400, error.message));

    const {
      categoryId,
      level2CategoryId,
      indicatorId,
      unitOfMeasure,
      assignedToType,
      assignedTo,
      assignedGroup,
      startDate,
      dueDate,
      calendarEvent,
    } = value;

    await validateCategories(categoryId, level2CategoryId);
    const indicatorTitle = await resolveIndicatorTitle(indicatorId);

    const indicator = await Indicator.create({
      category: categoryId,
      level2Category: level2CategoryId,
      indicatorTitle,
      unitOfMeasure,
      assignedToType,
      assignedTo: assignedTo || null,
      assignedGroup: assignedGroup || [],
      startDate,
      dueDate,
      calendarEvent: calendarEvent ?? null,
      createdBy: req.user._id,
      status: STATUS.PENDING,
    });

    // Log creation
    await logActivity({
      user: req.user._id,
      action: "create_indicator",
      entity: indicatorTitle,
      level: "success",
      entityId: indicator._id,
    });

    // Notify assigned users
    const adminUser = await User.findById(req.user._id).select("name");
    const assignedBy = adminUser?.name ?? "Administrator";

    const targets = new Set<string>();
    if (assignedTo) targets.add(assignedTo);
    assignedGroup?.forEach((id: string) => targets.add(id));

    for (const userId of targets) {
      await notifyUser({
        userId: new Types.ObjectId(userId),
        submittedBy: req.user._id,
        title: "New Indicator Assigned",
        message: indicatorTitle,
        type: "assignment",
        metadata: { indicatorId: indicator._id },
      });

      emitIndicatorUpdateToUser(userId, {
        indicatorId: indicator._id.toString(),
        status: indicator.status,
      });

      const user = await User.findById(userId).select("email");
      if (user?.email) {
        const mail = indicatorCreatedTemplate({
          indicatorTitle,
          assignedBy,
          dueDate,
          appUrl: `${env.FRONTEND_URL}/user/indicators/${indicator._id}`,
        });
        await sendMail({ to: user.email, ...mail });
      }
    }

    emitIndicatorUpdateToAdmins({
      indicatorId: indicator._id.toString(),
      status: indicator.status,
    });

    res.status(201).json({ success: true, indicator });
  },
);

/* =====================================================
 SUBMIT EVIDENCE
===================================================== */
export const submitIndicatorEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    console.log("--- SUBMIT EVIDENCE START ---");
    console.log("Indicator ID:", req.params.id);
    console.log("User:", req.user?._id);

    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const files = req.files as Express.Multer.File[];
    // LOG 1: Check if files are reaching Multer
    console.log(`Files Received: ${files?.length || 0}`);
    if (files) {
      files.forEach((f, i) =>
        console.log(`File [${i}]: ${f.originalname} (${f.size} bytes)`),
      );
    }

    if (!files || files.length === 0) {
      console.error("Submission blocked: No files found in req.files");
      return next(new ErrorHandler(400, "No files uploaded"));
    }

    const rawDescs = req.body.descriptions;
    // LOG 2: Check descriptions alignment
    console.log("Raw Descriptions from body:", rawDescs);

    const descriptions: string[] = Array.isArray(rawDescs)
      ? rawDescs
      : [rawDescs || ""];

    const evidenceItems: IEvidence[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const desc = descriptions[i] || "Evidence submission";

      console.log(`Uploading file ${i + 1}/${files.length} to Cloudinary...`);

      const upload = await uploadToCloudinary(
        file.buffer,
        indicator._id.toString(),
        file.originalname,
      );

      evidenceItems.push(
        buildEvidence(
          upload,
          file.originalname,
          file.size,
          file.mimetype,
          desc,
        ),
      );
    }

    indicator.evidence.push(...evidenceItems);
    indicator.status = STATUS.SUBMITTED;

    // LOG 3: Confirm before saving
    console.log(
      `Final evidence count to be saved: ${indicator.evidence.length}`,
    );
    await indicator.save();

    console.log("Database updated successfully. Sending response.");
    console.log("--- SUBMIT EVIDENCE END ---");

    res.json({ success: true, indicator });
  },
);

/* =====================================================
 APPROVE / REJECT INDICATOR
===================================================== */
const reviewIndicator = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  action: "approve" | "reject",
) => {
  try {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));

    const userRole = req.user.role?.toLowerCase();
    if (!hasRole(userRole, ["admin", "superadmin"]))
      return next(
        new ErrorHandler(403, "Only administrators can review indicators"),
      );

    const indicator = await Indicator.findById(req.params.id).populate(
      "assignedTo",
    );
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const { notes, reportData } = req.body || {};

    // Generate the specific deep link for this indicator
    const specificIndicatorUrl = `${process.env.FRONTEND_URL}/user/indicators/${indicator._id}`;

    // Safety check for the recipient email
    const recipientEmail = (indicator.assignedTo as any)?.email;

    // --------- REJECTION ---------
    if (action === "reject") {
      if (!notes || notes.trim().length === 0)
        return next(new ErrorHandler(400, "Rejection requires a remark."));

      indicator.status = STATUS.REJECTED;
      indicator.rejectionCount = (indicator.rejectionCount || 0) + 1;
      indicator.progress = 0;
      indicator.result = "fail";

      indicator.notes.push({
        text: notes.trim(),
        createdBy: req.user._id,
        createdAt: new Date(),
      });

      if (typeof recipientEmail === "string") {
        // Corrected: Uses rejection template and specific URL
        const mail = indicatorRejectedTemplate({
          indicatorTitle: indicator.indicatorTitle,
          rejectionNotes: notes.trim(),
          appUrl: specificIndicatorUrl,
        });

        await sendMail({
          to: recipientEmail,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
      }
    }

    // --------- APPROVAL ---------
    if (action === "approve") {
      indicator.status =
        userRole === "superadmin" ? STATUS.COMPLETED : STATUS.APPROVED;
      indicator.progress = 100;
      indicator.result = "pass";

      if (notes && typeof notes === "string") {
        indicator.notes.push({
          text: notes.trim(),
          createdBy: req.user._id,
          createdAt: new Date(),
        });
      }

      if (typeof recipientEmail === "string") {
        // Corrected: Uses approved template and specific URL
        const mail = indicatorApprovedTemplate({
          indicatorTitle: indicator.indicatorTitle,
          appUrl: specificIndicatorUrl,
        });

        await sendMail({
          to: recipientEmail,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
      }
    }

    // --------- METADATA & PERSISTENCE ---------
    indicator.reviewedBy = req.user._id;
    indicator.reviewedAt = new Date();
    if (reportData) indicator.reportData = reportData;

    await indicator.save();

    // ... Activity Logging and Socket Emitting logic ...

    res.status(200).json({ success: true, indicator });
  } catch (err) {
    next(err);
  }
};

export const approveIndicator = catchAsyncErrors((req, res, next) =>
  reviewIndicator(req, res, next, "approve"),
);
export const rejectIndicator = catchAsyncErrors((req, res, next) =>
  reviewIndicator(req, res, next, "reject"),
);

/* =====================================================
 OTHER GETTERS & DELETE
===================================================== */
export const updateIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== "SuperAdmin")
      return next(
        new ErrorHandler(403, "Only Super Admins can modify registries"),
      );

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const { notes, ...otherData } = req.body;
    delete otherData._id;
    delete otherData.createdAt;

    indicator.set(otherData);

    if (notes && typeof notes === "string" && notes.trim() !== "") {
      indicator.notes.push({
        text: notes,
        createdBy: req.user._id,
        createdAt: new Date(),
      });
    }

    await indicator.save();

    await logActivity({
      user: req.user._id,
      action: "update_indicator",
      entity: indicator.indicatorTitle,
      entityId: indicator._id,
      level: "info",
      meta: { updatedFields: Object.keys(otherData) },
    });

    res.status(200).json({ success: true, indicator });
  },
);

export const updateIndicatorProgress = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !hasRole(req.user.role, ["admin", "superadmin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    const { progress } = req.body;
    if (progress === undefined || progress < 0 || progress > 100)
      return next(new ErrorHandler(400, "Value 0-100 required"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Not found"));

    indicator.progress = progress;
    await indicator.save();

    await logActivity({
      user: req.user._id,
      action: "update_progress",
      entity: indicator.indicatorTitle,
      entityId: indicator._id,
      level: "info",
      meta: { progress },
    });

    res.status(200).json({ success: true, indicator });
  },
);

export const deleteIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1️⃣ Authorization check
    if (!req.user || !hasRole(req.user.role, ["superadmin"])) {
      return next(new ErrorHandler(403, "Forbidden"));
    }

    // 2️⃣ Find the indicator
    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    // 3️⃣ Delete associated Cloudinary files safely
    if (indicator.evidence?.length) {
      await Promise.all(
        indicator.evidence.map(async (item) => {
          try {
            // Validate resource type
            const resourceType = ["auto", "image", "video"].includes(
              item.resourceType,
            )
              ? (item.resourceType as "auto" | "image" | "video")
              : "auto";
            await deleteFromCloudinary(item.publicId, resourceType);
          } catch (err) {
            console.error(
              `Failed to delete Cloudinary file ${item.publicId}:`,
              err,
            );
          }
        }),
      );
    }

    // 4️⃣ Delete indicator from database
    await indicator.deleteOne();

    // 5️⃣ Log activity
    await logActivity({
      user: req.user._id,
      action: "delete_indicator",
      entity: indicator.indicatorTitle,
      entityId: indicator._id,
      level: "warn",
    });

    // 6️⃣ Return response
    res.status(200).json({
      success: true,
      message: "Indicator and associated files deleted",
    });
  },
);

/* =====================================================
 GETTERS
===================================================== */
export const getIndicatorById = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    const indicator = await Indicator.findById(req.params.id)
      .populate("category level2Category", "title")
      .populate("createdBy reviewedBy", "name email")
      .lean();

    await logActivity({
      user: req.user?._id || "SYSTEM",
      action: "view_indicator",
      entity: indicator?.indicatorTitle || "Unknown",
      entityId: indicator?._id,
      level: "info",
    });

    res.json({ success: !!indicator, indicator });
  },
);

export const getAllIndicators = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    const indicators = await Indicator.find()
      .populate("category level2Category", "title")
      .sort({ createdAt: -1 })
      .lean();

    await logActivity({
      user: req.user?._id || "SYSTEM",
      action: "view_all_indicators",
      entity: "All Indicators",
      level: "info",
    });

    res.json({ success: true, indicators });
  },
);

export const getSubmittedIndicators = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    const indicators = await Indicator.find({
      status: { $in: [STATUS.SUBMITTED, STATUS.APPROVED, STATUS.PENDING] },
    })
      .populate("category level2Category", "title")
      .populate("createdBy reviewedBy", "name email")
      .sort({ updatedAt: -1 })
      .lean();

    await logActivity({
      user: req.user?._id || "SYSTEM",
      action: "view_submitted_indicators",
      entity: "Submitted Indicators",
      level: "info",
    });

    res.json({ success: true, indicators });
  },
);

export const getUserIndicators = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    const indicators = await Indicator.find({
      $or: [{ assignedTo: req.user?._id }, { assignedGroup: req.user?._id }],
    })
      .populate("category level2Category", "title")
      .sort({ dueDate: 1 })
      .lean();

    await logActivity({
      user: req.user?._id || "SYSTEM",
      action: "view_user_indicators",
      entity: "User Indicators",
      level: "info",
    });

    res.json({ success: true, indicators });
  },
);

/* =====================================================
    PROXY STREAM EVIDENCE
===================================================== */

export const proxyEvidenceStream = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { indicatorId } = req.params;
    const publicId = decodeURIComponent(req.query.publicId as string);

    try {
      const hasExtension = publicId.toLowerCase().endsWith(".pdf");
      const resourceType = hasExtension ? "raw" : "image";

      // Even if the Cloudinary ID lacks .pdf, we want the signed URL
      // to treat the format as pdf so the stream is valid.
      const format = "pdf";

      const signedUrl = cloudinary.utils.private_download_url(
        publicId,
        format,
        {
          resource_type: resourceType,
          type: "authenticated",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      );

      const response = await axios({
        method: "get",
        url: signedUrl,
        responseType: "stream",
      });

      // --- HEADER UPDATES ---

      // 1. Set the content as PDF so the browser opens its viewer
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");

      // 2. FIX: Allow the frontend (5173) to frame the backend (8000)
      // We must remove SAMEORIGIN because the ports differ
      res.removeHeader("X-Frame-Options");

      // 3. Define who is allowed to embed this stream
      // 'self' refers to 8000, localhost:5173 is your React app
      res.setHeader(
        "Content-Security-Policy",
        `frame-ancestors 'self' ${env.FRONTEND_URL}`,
      );

      response.data.pipe(res);
    } catch (err: any) {
      console.error("[PROXY ERROR]:", err.response?.data || err.message);
      return next(new ErrorHandler(500, "Failed to stream document"));
    }
  },
);

/* =====================================================
  REFACTORED ADMIN SUBMIT EVIDENCE
=====================================================*/
export const adminSubmitIndicatorEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // ... validation logic

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const files = req.files as Express.Multer.File[];
    const rawDescs = req.body.descriptions;
    const descriptions = Array.isArray(rawDescs) ? rawDescs : [rawDescs];

    const uploadPromises = files.map((file, i) => {
      const desc = descriptions[i] || "Admin Verified Evidence";

      // ALIGNMENT: Pass indicator._id
      return uploadToCloudinary(
        file.buffer,
        indicator._id.toString(),
        file.originalname,
      ).then((upload) =>
        buildEvidence(
          upload,
          file.originalname,
          file.size,
          file.mimetype,
          desc,
        ),
      );
    });

    const evidenceItems = await Promise.all(uploadPromises);
  },
);

/* =====================================================
  RESUBMIT INDICATOR EVIDENCE
===================================================== */
export const resubmitIndicatorEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1️⃣ AUTHORIZATION CHECK
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    const user = req.user;

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const isAssignedUser = String(indicator.assignedTo) === String(user._id);
    const isAssignedGroup = (indicator.assignedGroup ?? []).some(
      (id) => String(id) === String(user._id),
    );
    const isSuperAdmin = user.role?.toLowerCase() === "superadmin";

    if (!isAssignedUser && !isAssignedGroup && !isSuperAdmin) {
      return next(
        new ErrorHandler(403, "You are not assigned to this indicator"),
      );
    }

    // 2️⃣ STATUS VALIDATION
    if (indicator.status !== STATUS.REJECTED) {
      return next(
        new ErrorHandler(400, "Only rejected indicators can be resubmitted"),
      );
    }

    // 3️⃣ FILE VALIDATION
    const files = req.files as Express.Multer.File[];
    if (!files?.length) {
      return next(new ErrorHandler(400, "Please upload revised evidence"));
    }

    // 4️⃣ ARCHIVE OLD EVIDENCE
    indicator.evidence.forEach((ev: any) => {
      if (!ev.isArchived) {
        ev.status = "archived";
        ev.isArchived = true;
        ev.archivedAt = new Date();
      }
    });

    // 5️⃣ RESUBMISSION ATTEMPT
    indicator.rejectionCount = (indicator.rejectionCount ?? 0) + 1;
    const attempt = indicator.rejectionCount;

    // 6️⃣ PROCESS NEW FILES
    const rawDescs = req.body.descriptions;
    const descriptions: string[] = Array.isArray(rawDescs)
      ? rawDescs
      : [rawDescs || ""];

    const newEvidence: IEvidence[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const desc =
        descriptions[i] || `Resubmission Evidence (Attempt ${attempt})`;

      const upload = await uploadToCloudinary(
        file.buffer,
        indicator._id.toString(),
        file.originalname,
      );

      newEvidence.push(
        buildEvidence(
          upload,
          file.originalname,
          file.size,
          file.mimetype,
          desc,
          attempt,
        ),
      );
    }

    indicator.evidence.push(...newEvidence);

    // 7️⃣ RESET INDICATOR STATE
    indicator.status = STATUS.SUBMITTED;
    indicator.result = null;
    indicator.reviewedBy = null;
    indicator.reviewedAt = null;

    indicator.notes.push({
      text: `USER RESUBMISSION — Attempt ${attempt}`,
      createdBy: user._id,
      createdAt: new Date(),
    });

    await indicator.save();

    // 8️⃣ LOGGING
    await logActivity({
      user: user._id,
      action: "resubmit_evidence",
      entity: indicator.indicatorTitle,
      entityId: indicator._id,
      level: "info",
      meta: { attempt, files: files.length },
    });

    // 9️⃣ SOCKET EMIT
    emitIndicatorUpdateToAdmins({
      indicatorId: indicator._id.toString(),
      status: STATUS.SUBMITTED,
    });

    // 10️⃣ RESPONSE
    res.status(200).json({
      success: true,
      message: "Evidence resubmitted successfully",
      indicator,
    });
  },
);

/**
 * @desc   Admin submits a score/progress for an indicator
 * @route  PATCH /api/indicators/:id/submit-score
 * @access Private (Admin)
 */
export const submitIndicatorScore = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { score, note } = req.body;
    const adminId = req.user?._id;

    if (!adminId) {
      return next(new ErrorHandler(401, "Unauthorized: adminId missing"));
    }

    if (typeof score !== "number" || score < 0 || score > 100) {
      return next(
        new ErrorHandler(400, "Score must be a number between 0 and 100"),
      );
    }

    // 1. Fetch the indicator
    const indicator = await Indicator.findById(id);
    if (!indicator) {
      return next(new ErrorHandler(404, "Indicator not found"));
    }

    // 2. Update progress
    indicator.progress = score;

    // 3. Add note if provided
    if (note) {
      indicator.notes.push({
        text: note,
        createdBy: adminId as mongoose.Types.ObjectId,
        createdAt: new Date(),
      });
    }

    // 4. Update status based on progress
    if (score === 100) {
      indicator.status = "completed";
    } else {
      indicator.status = "submitted"; // partially completed
    }

    // 5. Add to result tracking (optional: you can expand this)
    indicator.result = score === 100 ? "pass" : undefined;

    // 6. Save the indicator
    await indicator.save();

    // 7. Response
    res.status(200).json({
      success: true,
      message:
        score === 100
          ? "Indicator marked as completed."
          : "Indicator partially completed. SuperAdmin should set a new deadline.",
      indicator,
    });
  },
);


/* =====================================================
  DELETE SINGLE EVIDENCE ITEM
===================================================== */
/* =====================================================
  DELETE SINGLE EVIDENCE ITEM (User Accessible)
===================================================== */
export const deleteSingleEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id, evidenceId } = req.params;

    // 1️⃣ Authentication check
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    const user = req.user;

    // 2️⃣ Find the indicator
    const indicator = await Indicator.findById(id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    // 3️⃣ Detailed Authorization check
    const isAssignedUser = String(indicator.assignedTo) === String(user._id);
    const isAssignedGroup = (indicator.assignedGroup ?? []).some(
      (userId) => String(userId) === String(user._id)
    );
    const isSuperAdmin = hasRole(user.role, ["superadmin", "admin"]);

    if (!isAssignedUser && !isAssignedGroup && !isSuperAdmin) {
      return next(
        new ErrorHandler(403, "You do not have permission to modify this indicator")
      );
    }

    // 4️⃣ Check Status (Optional Safeguard)
    // You might want to prevent deletion if the indicator is already "Approved" or "Completed"
    if (indicator.status === STATUS.COMPLETED && !isSuperAdmin) {
      return next(new ErrorHandler(400, "Cannot delete evidence from a completed indicator"));
    }

    // 5️⃣ Find the specific evidence item
    const evidenceItem = indicator.evidence.find(
      (ev: any) => String(ev._id) === evidenceId
    );

    if (!evidenceItem) {
      return next(new ErrorHandler(404, "Evidence document not found"));
    }

    // 6️⃣ Delete from Cloudinary
    try {
      const resourceType = ["auto", "image", "video"].includes(evidenceItem.resourceType)
        ? (evidenceItem.resourceType as "auto" | "image" | "video")
        : "auto";

      await deleteFromCloudinary(evidenceItem.publicId, resourceType);
    } catch (err) {
      // We log the error but continue so the DB doesn't stay stuck with a broken link
      console.error(`Cloudinary deletion failed for ${evidenceItem.publicId}:`, err);
    }

    // 7️⃣ Remove from MongoDB array
    (indicator.evidence as any).pull(evidenceId);

    // 8️⃣ Logic: If user deletes all evidence, revert status to pending?
    if (indicator.evidence.length === 0 && indicator.status === STATUS.SUBMITTED) {
      indicator.status = STATUS.PENDING;
    }

    await indicator.save();

    // 9️⃣ Log activity
    await logActivity({
      user: user._id,
      action: "delete_evidence_item",
      entity: indicator.indicatorTitle,
      entityId: indicator._id,
      level: "info",
      meta: { fileName: evidenceItem.fileName, evidenceId }
    });

    res.status(200).json({
      success: true,
      message: "Document deleted successfully",
      indicator,
    });
  }
);