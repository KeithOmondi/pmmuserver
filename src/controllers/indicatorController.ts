import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { Types } from "mongoose";
import path from "path";
import AdmZip from "adm-zip";
import mime from "mime-types"; // 🟢 Recommended: npm install mime-types

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
    AUTH TYPES
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
    ROLE HELPER
===================================================== */
const hasRole = (role: string | undefined, allowed: string[]) =>
  !!role && allowed.map((r) => r.toLowerCase()).includes(role.toLowerCase());

/* =====================================================
    VALIDATION
===================================================== */
const objectId = Joi.string().hex().length(24);

const createIndicatorSchema = Joi.object({
  categoryId: objectId.required(),
  level2CategoryId: objectId.required(),
  indicatorId: objectId.required(),
  unitOfMeasure: Joi.string().trim().required(),
  assignedToType: Joi.string().valid("individual", "group").required(),
  assignedTo: objectId.optional(),
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
      message: "At least one assignee (individual or group) is required",
    });
  }
  return value;
});

/* =====================================================
    CATEGORY HELPERS
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
    CLOUDINARY NORMALIZERS
===================================================== */
const normalizeResourceType = (type: string): "raw" | "image" | "video" =>
  type === "image" || type === "video" || type === "raw" ? type : "raw";

/* =====================================================
    EVIDENCE BUILDER (MODIFIED FOR INLINE PREVIEW)
===================================================== */
const buildEvidence = (
  upload: any,
  fileName: string,
  fileSize: number,
  mimeType: string,
  description = ""
): IEvidence => {
  
  // 🟢 THE "NUKES FROM ORBIT" FIX:
  // We use private_download_url because it allows explicit control over the attachment flag.
  const signedUrl = cloudinary.utils.private_download_url(upload.public_id, upload.format, {
    resource_type: upload.resource_type,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    attachment: false, // 👈 THIS IS THE KEY: Forces Content-Disposition: inline
  });

  return {
    type: "file",
    fileName,
    fileSize,
    mimeType,
    description,
    publicId: upload.public_id,
    resourceType: upload.resource_type === "image" || upload.resource_type === "video" ? upload.resource_type : "raw",
    cloudinaryType: "authenticated",
    format: upload.format || fileName.split('.').pop() || "bin",
    previewUrl: signedUrl, 
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
      assignedTo,
      assignedGroup,
      startDate,
      dueDate,
      calendarEvent: calendarEvent ?? null,
      createdBy: req.user._id,
      status: STATUS.PENDING,
    });

    const admin = await User.findById(req.user._id).select("name");
    const assignedBy = admin?.name ?? "Judicial Administrator";

    const targets = new Set<string>();
    if (assignedTo) targets.add(assignedTo);
    assignedGroup?.forEach((id: string) => targets.add(id));

    for (const userId of targets) {
      await notifyUser({
        userId: new Types.ObjectId(userId),
        submittedBy: req.user._id,
        title: "New Performance Indicator Assigned",
        message: `You have been assigned: ${indicatorTitle}`,
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

    await logActivity({
      user: req.user._id,
      action: "CREATE_INDICATOR",
      entity: indicatorTitle,
      entityId: indicator._id,
      level: "success",
    });

    res.status(201).json({ success: true, indicator });
  },
);

/* =====================================================
    SUBMIT EVIDENCE (PREVIEW ONLY)
===================================================== */
export const submitIndicatorEvidence = catchAsyncErrors(
  async (req: any, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const files = req.files?.files;
    if (!files?.length) return next(new ErrorHandler(400, "No files uploaded"));

    const rawDescs = req.body.descriptions;
    const descriptions: string[] = Array.isArray(rawDescs)
      ? rawDescs
      : [rawDescs || ""];

    const evidenceItems: IEvidence[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const desc = descriptions[i] || "Evidence submission";

      if (
        file.mimetype === "application/zip" ||
        file.originalname.endsWith(".zip")
      ) {
        const zip = new AdmZip(file.buffer);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;

          const buffer = entry.getData();
          // 🟢 FIX: Lookup actual MIME type from extension to enable preview
          const entryMime =
            mime.lookup(entry.entryName) || "application/octet-stream";

          const upload = await uploadToCloudinary(
            buffer,
            "indicators/evidence",
            path.parse(entry.entryName).name,
          );

          evidenceItems.push(
            buildEvidence(
              upload,
              entry.entryName,
              buffer.length,
              entryMime,
              desc,
            ),
          );
        }
      } else {
        const upload = await uploadToCloudinary(
          file.buffer,
          "indicators/evidence",
          path.parse(file.originalname).name,
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
    }

    indicator.evidence.push(...evidenceItems);
    indicator.status = STATUS.SUBMITTED;
    await indicator.save();

    emitIndicatorUpdateToAdmins({
      indicatorId: indicator._id.toString(),
      status: indicator.status,
    });

    res.json({ success: true, indicator });
  },
);

/* =====================================================
    REVIEW HANDLER (APPROVE / REJECT)
===================================================== */
const reviewIndicator = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  status: StatusType,
) => {
  if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
  if (!hasRole(req.user.role, ["admin", "superadmin"]))
    return next(
      new ErrorHandler(403, "Only administrators can review indicators"),
    );

  const indicator = await Indicator.findById(req.params.id);
  if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

  const { notes, reportData } = req.body;

  if (status === STATUS.REJECTED && (!notes || notes.trim().length === 0)) {
    return next(
      new ErrorHandler(
        400,
        "Rejection requires a clear remark explaining the reason.",
      ),
    );
  }

  indicator.status = status;
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

  if (status === STATUS.APPROVED) {
    indicator.progress = 100;
    indicator.result = "pass";
  } else if (status === STATUS.REJECTED) {
    indicator.progress = 0;
    indicator.result = "fail";
  }

  await indicator.save();

  const payload = {
    indicatorId: indicator._id.toString(),
    status: indicator.status,
  };
  emitIndicatorUpdateToAdmins(payload);

  const targets = new Set<string>();
  if (indicator.assignedTo) targets.add(indicator.assignedTo.toString());
  indicator.assignedGroup?.forEach((id) => targets.add(id.toString()));
  targets.forEach((userId) => emitIndicatorUpdateToUser(userId, payload));

  const populatedIndicator = await Indicator.findById(indicator._id)
    .populate("category level2Category", "title")
    .populate("createdBy reviewedBy", "name email")
    .populate("notes.createdBy", "name")
    .lean({ virtuals: true });

  res.status(200).json({ success: true, indicator: populatedIndicator });
};

export const approveIndicator = catchAsyncErrors(async (req, res, next) =>
  reviewIndicator(req, res, next, STATUS.APPROVED),
);
export const rejectIndicator = catchAsyncErrors(async (req, res, next) =>
  reviewIndicator(req, res, next, STATUS.REJECTED),
);

/* =====================================================
    OTHER GETTERS & DELETE
===================================================== */
export const updateIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["admin", "superadmin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const { notes, ...otherData } = req.body;
    Object.assign(indicator, otherData);

    if (notes && typeof notes === "string") {
      indicator.notes.push({
        text: notes,
        createdBy: req.user._id,
        createdAt: new Date(),
      });
    }

    await indicator.save();

    const payload = {
      indicatorId: indicator._id.toString(),
      status: indicator.status,
    };
    emitIndicatorUpdateToAdmins(payload);
    if (indicator.assignedTo)
      emitIndicatorUpdateToUser(indicator.assignedTo.toString(), payload);

    res.json({ success: true, indicator });
  },
);

export const updateIndicatorProgress = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["admin", "superadmin"]))
      return next(
        new ErrorHandler(403, "Only administrators can update progress."),
      );

    const { id } = req.params;
    const { progress } = req.body;

    if (progress === undefined || progress < 0 || progress > 100) {
      return next(new ErrorHandler(400, "Provide a value between 0 and 100."));
    }

    const indicator = await Indicator.findById(id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    indicator.progress = progress;
    await indicator.save();

    const payload = {
      indicatorId: indicator._id.toString(),
      status: indicator.status,
    };
    emitIndicatorUpdateToAdmins(payload);
    if (indicator.assignedTo)
      emitIndicatorUpdateToUser(indicator.assignedTo.toString(), payload);

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
  const indicators = await Indicator.find({
    status: { $in: [STATUS.PENDING, STATUS.SUBMITTED, STATUS.APPROVED] },
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
