import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import mongoose, { Types } from "mongoose";
import axios from "axios";

import { Category, ICategory } from "../models/Category";
import { Indicator, IEvidence } from "../models/Indicator";
import { User } from "../models/User";

import { catchAsyncErrors } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../middleware/errorMiddlewares";

import {
  cloudinary,
  deleteFromCloudinary,
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

// ✅ Centralized helpers
import {
  hasRole,
  validateCategories,
  resolveIndicatorTitle,
  buildEvidence,
} from "../utils/helpers";

/* =====================================================
  STATUS CONSTANTS
===================================================== */
export const STATUS = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  COMPLETED: "completed",
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

export interface IEditHistory {
  updatedBy: mongoose.Types.ObjectId | string;
  updatedAt: Date;
  changes: Record<string, { old: any; new: any }>;
}

export interface IIndicator extends mongoose.Document {
  editHistory: IEditHistory[];
  // ...other Indicator fields remain as defined in your model
}

/* =====================================================
  JOI SCHEMA
===================================================== */
const objectId = Joi.string().hex().length(24);

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
  CREATE INDICATOR
===================================================== */
export const createIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["superadmin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    if (!Array.isArray(req.body.assignedGroup)) req.body.assignedGroup = [];
    if (typeof req.body.assignedGroup === "string")
      req.body.assignedGroup = [req.body.assignedGroup];
    if (req.body.assignedTo === "") delete req.body.assignedTo;

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
  SUBMIT EVIDENCE (USER)
===================================================== */
export const submitIndicatorEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0)
      return next(new ErrorHandler(400, "No files uploaded"));

    const rawDescs = req.body.descriptions;
    const descriptions: string[] = Array.isArray(rawDescs)
      ? rawDescs
      : [rawDescs || ""];

    const evidenceItems: IEvidence[] = await Promise.all(
      files.map(async (file, i) => {
        const desc = descriptions[i] || "Evidence submission";
        const upload = await uploadToCloudinary(
          file.buffer,
          indicator._id.toString(),
          file.originalname,
        );
        return buildEvidence(
          upload,
          file.originalname,
          file.size,
          file.mimetype,
          req.user!._id,
          desc,
        );
      }),
    );

    indicator.evidence.push(...evidenceItems);
    indicator.status = STATUS.SUBMITTED;
    await indicator.save();

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

    const { notes, reportData } = req.body;
    const specificIndicatorUrl = `${env.FRONTEND_URL}/user/indicators/${indicator._id}`;
    const recipientEmail = (indicator.assignedTo as any)?.email;

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

      if (recipientEmail) {
        const mail = indicatorRejectedTemplate({
          indicatorTitle: indicator.indicatorTitle,
          rejectionNotes: notes.trim(),
          appUrl: specificIndicatorUrl,
        });
        await sendMail({ to: recipientEmail, ...mail });
      }
    } else if (action === "approve") {
      indicator.status =
        userRole === "superadmin" ? STATUS.COMPLETED : STATUS.APPROVED;
      indicator.progress = 100;
      indicator.result = "pass";

      if (notes && typeof notes === "string")
        indicator.notes.push({
          text: notes.trim(),
          createdBy: req.user._id,
          createdAt: new Date(),
        });

      if (recipientEmail) {
        const mail = indicatorApprovedTemplate({
          indicatorTitle: indicator.indicatorTitle,
          appUrl: specificIndicatorUrl,
        });
        await sendMail({ to: recipientEmail, ...mail });
      }
    }

    indicator.reviewedBy = req.user._id;
    indicator.reviewedAt = new Date();
    if (reportData) indicator.reportData = reportData;

    await indicator.save();
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
  UPDATE INDICATOR (GENERAL)
===================================================== */
export const updateIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !hasRole(req.user.role, ["admin", "superadmin"]))
      return next(new ErrorHandler(403, "Forbidden: Admin access required"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    if (
      indicator.status === STATUS.COMPLETED &&
      req.user.role?.toLowerCase() !== "superadmin"
    ) {
      return next(
        new ErrorHandler(
          403,
          "Sealed: Only Super Admins can edit completed records",
        ),
      );
    }

    const { notes, evidence: incomingEvidence, ...otherData } = req.body;

    const changes: Record<string, { old: any; new: any }> = {};
    const trackableFields = [
      "indicatorTitle",
      "unitOfMeasure",
      "startDate",
      "dueDate",
      "assignedTo",
      "status",
      "nextDeadline",
    ];

    trackableFields.forEach((field) => {
      const currentVal = indicator.get(field);
      const newVal = otherData[field];
      if (newVal !== undefined && String(currentVal) !== String(newVal))
        changes[field] = { old: currentVal, new: newVal };
    });

    if (incomingEvidence && Array.isArray(incomingEvidence)) {
      incomingEvidence.forEach((incomingItem: any) => {
        const existingItem = (indicator.evidence as any).id(incomingItem._id);
        if (
          existingItem &&
          incomingItem.description !== undefined &&
          existingItem.description !== incomingItem.description
        ) {
          changes[`evidence.${incomingItem._id}.description`] = {
            old: existingItem.description,
            new: incomingItem.description,
          };
          existingItem.description = incomingItem.description;
        }
      });
    }

    if (Object.keys(changes).length > 0) {
      indicator.editHistory.push({
        updatedBy: req.user._id,
        updatedAt: new Date(),
        changes,
      });
    }

    indicator.set(otherData);

    if (notes && notes.trim() !== "")
      indicator.notes.push({
        text: notes.trim(),
        createdBy: req.user._id,
        createdAt: new Date(),
      });

    await indicator.save();

    const updatedIndicator = await Indicator.findById(indicator._id)
      .populate("category level2Category", "title")
      .populate("createdBy reviewedBy", "name email")
      .populate("editHistory.updatedBy", "name")
      .lean();

    res.status(200).json({ success: true, indicator: updatedIndicator });
  },
);

/* =====================================================
  UPDATE EVIDENCE DESCRIPTION
===================================================== */
export const updateEvidenceDescription = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id, evidenceId } = req.params;
    const { description } = req.body;

    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));

    const indicator = await Indicator.findById(id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    if (indicator.status === STATUS.COMPLETED)
      return next(
        new ErrorHandler(403, "Record is sealed and cannot be modified"),
      );

    const evidenceArray =
      indicator.evidence as mongoose.Types.DocumentArray<IEvidence>;
    const evidenceDoc = evidenceArray.id(evidenceId);

    if (!evidenceDoc) return next(new ErrorHandler(404, "Evidence not found"));

    const oldDescription = evidenceDoc.description || "";
    const newDescription = description ?? "";

    if (oldDescription !== newDescription) {
      indicator.editHistory.push({
        updatedBy: req.user._id,
        updatedAt: new Date(),
        changes: {
          [`evidence.${evidenceId}.description`]: {
            old: oldDescription,
            new: newDescription,
          },
        },
      });

      evidenceDoc.description = newDescription;
      await indicator.save();
    }

    res.status(200).json({
      success: true,
      message: "Description updated successfully",
      indicator,
    });
  },
);

/* =====================================================
  DELETE INDICATOR
===================================================== */
export const deleteIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !hasRole(req.user.role, ["superadmin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    // Delete associated Cloudinary files
    if (indicator.evidence?.length) {
      await Promise.all(
        indicator.evidence.map(async (item) => {
          try {
            await deleteFromCloudinary(
              item.publicId,
              item.resourceType || "auto",
            );
          } catch (err) {
            console.error(
              `Failed to delete Cloudinary file ${item.publicId}:`,
              err,
            );
          }
        }),
      );
    }

    await indicator.deleteOne();

    await logActivity({
      user: req.user._id,
      action: "delete_indicator",
      entity: indicator.indicatorTitle,
      entityId: indicator._id,
      level: "warn",
    });

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

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      res.removeHeader("X-Frame-Options");
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
  DELETE SINGLE EVIDENCE (USER ONLY)
===================================================== */
export const deleteSingleEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id, evidenceId } = req.params;
    const indicator = await Indicator.findById(id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const evidenceDoc = indicator.evidence.find(
      (e) => e._id.toString() === evidenceId,
    );
    if (!evidenceDoc) return next(new ErrorHandler(404, "Evidence not found"));

    if (evidenceDoc.uploadedBy?.toString() !== req.user!._id.toString())
      return next(
        new ErrorHandler(
          403,
          "Access Denied: You can only delete evidence you uploaded.",
        ),
      );

    if (indicator.status === STATUS.COMPLETED)
      return next(
        new ErrorHandler(403, "Action prohibited: This record is sealed."),
      );

    try {
      await deleteFromCloudinary(
        evidenceDoc.publicId,
        evidenceDoc.resourceType || "auto",
      );
    } catch (err) {
      console.error("Cloudinary Cleanup Failed:", err);
    }

    (indicator.evidence as any).pull(evidenceId);
    if (indicator.evidence.length === 0) indicator.status = STATUS.PENDING;

    await indicator.save();

    res.status(200).json({
      success: true,
      message: "Your evidence has been removed.",
      indicator,
    });
  },
);

/* =====================================================
  UPDATE INDICATOR PROGRESS (ADMIN / SUPERADMIN)
===================================================== */
export const updateIndicatorProgress = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !hasRole(req.user.role, ["admin", "superadmin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    const { progress } = req.body;
    if (progress === undefined || progress < 0 || progress > 100)
      return next(new ErrorHandler(400, "Value 0-100 required"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const oldProgress = indicator.progress;
    indicator.progress = progress;

    await indicator.save();

    await logActivity({
      user: req.user._id,
      action: "update_progress",
      entity: indicator.indicatorTitle,
      entityId: indicator._id,
      level: "info",
      meta: { oldProgress, newProgress: progress },
    });

    res.status(200).json({ success: true, indicator });
  },
);

/* =====================================================
  ADMIN SUBMIT INDICATOR EVIDENCE
===================================================== */
export const adminSubmitIndicatorEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user?._id)
      return next(new ErrorHandler(401, "Admin authentication required"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new ErrorHandler(400, "No files uploaded"));

    const rawDescs = req.body.descriptions || [];
    const descriptions = Array.isArray(rawDescs) ? rawDescs : [rawDescs];

    const uploadPromises = files.map(async (file, i) => {
      const desc = descriptions[i] || "Admin Verified Evidence";
      const upload = await uploadToCloudinary(
        file.buffer,
        indicator._id.toString(),
        file.originalname,
      );
      return buildEvidence(
        upload,
        file.originalname,
        file.size,
        file.mimetype,
        req.user!._id,
        desc,
      );
    });

    const evidenceItems = await Promise.all(uploadPromises);
    indicator.evidence.push(...evidenceItems);

    // Admin submission typically auto-approves
    indicator.status = STATUS.APPROVED;
    indicator.progress = 100;
    indicator.reviewedAt = new Date();
    indicator.reviewedBy = req.user._id;

    await indicator.save();

    res.status(200).json({ success: true, indicator });
  },
);

/* =====================================================
  RESUBMIT INDICATOR EVIDENCE (USER)
===================================================== */
export const resubmitIndicatorEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    const user = req.user;

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    if (indicator.status !== STATUS.REJECTED)
      return next(
        new ErrorHandler(400, "Only rejected indicators can be resubmitted"),
      );

    const files = req.files as Express.Multer.File[];
    if (!files?.length)
      return next(new ErrorHandler(400, "Please upload revised evidence"));

    // Archive old evidence
    indicator.evidence.forEach((ev: any) => {
      if (!ev.isArchived) {
        ev.status = "archived";
        ev.isArchived = true;
        ev.archivedAt = new Date();
      }
    });

    const attempt = (indicator.rejectionCount ?? 0) + 1;
    indicator.rejectionCount = attempt;

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
          user._id,
          desc,
          attempt,
        ),
      );
    }

    indicator.evidence.push(...newEvidence);
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

    res.status(200).json({ success: true, indicator });
  },
);

/* =====================================================
  SUBMIT INDICATOR SCORE (ADMIN)
===================================================== */
export const submitIndicatorScore = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { score, note, nextDeadline } = req.body;
    const adminId = req.user?._id;

    if (!adminId) return next(new ErrorHandler(401, "Unauthorized"));

    if (typeof score !== "number" || score < 0 || score > 100)
      return next(new ErrorHandler(400, "Score must be between 0 and 100"));

    const indicator = await Indicator.findById(id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const changes: any = {};
    if (indicator.progress !== score)
      changes.progress = { old: indicator.progress, new: score };

    indicator.progress = score;
    indicator.scoreHistory.push({
      score,
      submittedBy: adminId,
      submittedAt: new Date(),
    });

    if (score === 100) {
      indicator.status = STATUS.COMPLETED;
      indicator.result = "pass";
    } else if (score > 0) {
      indicator.status = "partially_completed";
      if (nextDeadline) {
        indicator.nextDeadline = new Date(nextDeadline);
        changes.nextDeadline = { old: null, new: nextDeadline };
      }
    }

    if (Object.keys(changes).length > 0) {
      indicator.editHistory.push({
        updatedBy: adminId,
        updatedAt: new Date(),
        changes,
      });
    }

    if (note) {
      indicator.notes.push({
        text: `[Score Update ${score}%]: ${note}`,
        createdBy: adminId,
        createdAt: new Date(),
      });
    }

    await indicator.save();

    res.status(200).json({
      success: true,
      message: score === 100 ? "Completed" : "Partially completed",
      indicator,
    });
  },
);
