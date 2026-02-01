import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { Types } from "mongoose";
import path from "path";

import { Category, ICategory } from "../models/Category";
import { Indicator, IEvidence } from "../models/Indicator";
import { User } from "../models/User";

import { catchAsyncErrors } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../middleware/errorMiddlewares";

import { cloudinary, uploadToCloudinary } from "../utils/cloudinary";
import { logActivity } from "../utils/activityLogger";
import { notifyUser } from "../services/notification.service";
import sendMail from "../utils/sendMail";
import { indicatorCreatedTemplate } from "../utils/mailTemplates";
import { env } from "../config/env";
import {
  emitIndicatorUpdateToAdmins,
  emitIndicatorUpdateToUser,
} from "../sockets/socket";

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
 JOI
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
): IEvidence => {
  const signedUrl = cloudinary.utils.private_download_url(
    upload.public_id,
    upload.format,
    {
      resource_type: upload.resource_type,
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      attachment: false,
    },
  );

  return {
    type: "file",
    fileName,
    fileSize,
    mimeType,
    description,
    publicId: upload.public_id,
    resourceType:
      upload.resource_type === "image" || upload.resource_type === "video"
        ? upload.resource_type
        : "raw",
    cloudinaryType: "authenticated",
    format: upload.format || "bin",
    previewUrl: signedUrl,
  };
};

/* =====================================================
 CREATE INDICATOR
===================================================== */

export const createIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new ErrorHandler(401, "Unauthorized");
    if (!hasRole(req.user.role, ["superadmin"]))
      throw new ErrorHandler(403, "Forbidden");

    if (req.body.assignedTo === "") delete req.body.assignedTo;
    if (!Array.isArray(req.body.assignedGroup)) req.body.assignedGroup = [];
    if (typeof req.body.assignedGroup === "string")
      req.body.assignedGroup = [req.body.assignedGroup];

    const { error, value } = createIndicatorSchema.validate(req.body, {
      stripUnknown: true,
    });
    if (error) throw new ErrorHandler(400, error.message);

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
  async (req: any, res: Response, next: NextFunction) => {
   
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    if (indicator.status === STATUS.REJECTED) {
      for (const item of indicator.evidence) {
        if (item.publicId) {
          await cloudinary.uploader.destroy(item.publicId, {
            resource_type: item.resourceType || "raw",
          });
        }
      }
      indicator.evidence = [];
    }

    // Capture the files array
    const files = req.files as Express.Multer.File[];
    
    // This is the line currently triggering your 400 error
    if (!files || files.length === 0) {
      console.error("Validation Failed: req.files is empty or undefined");
      return next(new ErrorHandler(400, "No files uploaded"));
    }

    const rawDescs = req.body.descriptions;
    const descriptions: string[] = Array.isArray(rawDescs)
      ? rawDescs
      : [rawDescs || ""];

    const evidenceItems: IEvidence[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const desc = descriptions[i] || "Evidence submission";

      const upload = await uploadToCloudinary(
        file.buffer,
        "indicators/evidence",
        path.parse(file.originalname).name
      );

      evidenceItems.push(
        buildEvidence(
          upload,
          file.originalname,
          file.size,
          file.mimetype,
          desc
        )
      );
    }

    indicator.evidence.push(...evidenceItems);
    indicator.status = STATUS.SUBMITTED;
    await indicator.save();

    emitIndicatorUpdateToAdmins({
      indicatorId: indicator._id.toString(),
      status: indicator.status,
    });

    res.json({ success: true, indicator });
  }
);
/* =====================================================
 REVIEW HANDLER (TWO-STAGE APPROVAL)
===================================================== */

const reviewIndicator = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  action: "approve" | "reject",
) => {
  if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));

  const userRole = req.user.role?.toLowerCase();
  if (!hasRole(userRole, ["admin", "superadmin"]))
    return next(
      new ErrorHandler(403, "Only administrators can review indicators"),
    );

  const indicator = await Indicator.findById(req.params.id);
  if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

  const { notes, reportData } = req.body || {};

  if (action === "reject") {
    if (!notes || notes.trim().length === 0)
      return next(new ErrorHandler(400, "Rejection requires a remark."));
    indicator.status = STATUS.REJECTED;
    indicator.rejectionCount = (indicator.rejectionCount || 0) + 1;
    indicator.progress = 0;
    indicator.result = "fail";
  } else if (action === "approve") {
    // Stage 2: Superadmin Approval
    if (userRole === "superadmin") {
      indicator.status = STATUS.COMPLETED;
      indicator.progress = 100;
      indicator.result = "pass";
    }
    // Stage 1: Admin Approval
    else {
      indicator.status = STATUS.APPROVED;
      indicator.progress = 100; // It is verified, but not "Complete" yet
      indicator.result = "pass";
    }
  }

  indicator.reviewedBy = req.user._id;
  indicator.reviewedAt = new Date();
  if (reportData) indicator.reportData = reportData;

  if (notes && typeof notes === "string") {
    indicator.notes.push({
      text: notes.trim(),
      createdBy: req.user._id,
      createdAt: new Date(),
    });
  }

  await indicator.save();

  emitIndicatorUpdateToAdmins({
    indicatorId: indicator._id.toString(),
    status: indicator.status,
  });
  if (indicator.assignedTo) {
    emitIndicatorUpdateToUser(indicator.assignedTo.toString(), {
      indicatorId: indicator._id.toString(),
      status: indicator.status,
    });
  }

  res.status(200).json({ success: true, indicator });
};

export const approveIndicator = catchAsyncErrors(async (req, res, next) =>
  reviewIndicator(req, res, next, "approve"),
);
export const rejectIndicator = catchAsyncErrors(async (req, res, next) =>
  reviewIndicator(req, res, next, "reject"),
);

/* =====================================================
 OTHER GETTERS & DELETE
===================================================== */

export const updateIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
   // 1. Strict Role Verification
if (!req.user || req.user.role !== "SuperAdmin") {
  return next(new ErrorHandler(403, "Only Super Admins can modify registries"));
}

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const { notes, ...otherData } = req.body;

    // 2. Security: Clean the incoming data
    // Remove fields that shouldn't be manually updated or could break the DB
    delete otherData._id;
    delete otherData.createdAt;

    // 3. Apply updates
    // .set() is better than Object.assign for Mongoose as it handles casting
    indicator.set(otherData);

    // 4. Handle Notes specifically
    if (notes && typeof notes === "string" && notes.trim() !== "") {
      indicator.notes.push({
        text: notes,
        createdBy: req.user._id,
        createdAt: new Date(),
      });
    }

    await indicator.save();

    res.status(200).json({ 
      success: true, 
      indicator 
    });
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
    res.status(200).json({ success: true, indicator });
  },
);

export const deleteIndicator = catchAsyncErrors(async (req, res, next) => {
  if (!req.user || !hasRole(req.user.role, ["superadmin"]))
    return next(new ErrorHandler(403, "Forbidden"));
  const indicator = await Indicator.findById(req.params.id);
  if (!indicator) return next(new ErrorHandler(404, "Not found"));
  await indicator.deleteOne();
  res.json({ success: true });
});

export const getIndicatorById = catchAsyncErrors(async (req, res) => {
  const indicator = await Indicator.findById(req.params.id)
    .populate("category level2Category", "title")
    .populate("createdBy reviewedBy", "name email")
    .lean();
  res.json({ success: !!indicator, indicator });
});

export const getAllIndicators = catchAsyncErrors(async (req, res) => {
  const indicators = await Indicator.find()
    .populate("category level2Category", "title")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, indicators });
});

export const getSubmittedIndicators = catchAsyncErrors(async (req, res) => {
  // We keep APPROVED in the list so the Superadmin can see items ready for final completion
  const indicators = await Indicator.find({
    status: { $in: [STATUS.SUBMITTED, STATUS.APPROVED, STATUS.PENDING] },
  })
    .populate("category level2Category", "title")
    .populate("createdBy reviewedBy", "name email")
    .sort({ updatedAt: -1 })
    .lean();
  res.json({ success: true, indicators });
});

export const getUserIndicators = catchAsyncErrors(async (req, res) => {
  const indicators = await Indicator.find({
    $or: [{ assignedTo: req.user?._id }, { assignedGroup: req.user?._id }],
  })
    .populate("category level2Category", "title")
    .sort({ dueDate: 1 })
    .lean();
  res.json({ success: true, indicators });
});
