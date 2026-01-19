import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { Types } from "mongoose";
import axios from "axios";
import path from "path";
import { extension as mimeExtension } from "mime-types";
import AdmZip from "adm-zip";

import { Category, ICategory } from "../models/Category";
import { Indicator, IEvidence } from "../models/Indicator";
import { User } from "../models/User";

import { catchAsyncErrors } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../middleware/errorMiddlewares";

import { uploadToCloudinary, cloudinary } from "../utils/cloudinary";
import { logActivity } from "../utils/activityLogger";
import { notifyUser } from "../services/notification.service";
import sendMail from "../utils/sendMail";
import { indicatorCreatedTemplate } from "../utils/mailTemplates";
import { env } from "../config/env";

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
  assignedToType: Joi.string().valid("individual", "group", "mixed").required(),
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
   CLOUDINARY TYPE NORMALIZERS
===================================================== */
const normalizeResourceType = (type: string): "raw" | "image" | "video" => {
  if (type === "image" || type === "video" || type === "raw") return type;
  return "raw"; // fallback for "auto" or unknown
};

const normalizeCloudinaryType = (type: string): "upload" | "authenticated" => {
  if (type === "authenticated") return "authenticated";
  return "upload"; // default
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

      const user = await User.findById(userId).select("email");
      if (user?.email) {
        const mail = indicatorCreatedTemplate({
          indicatorTitle,
          assignedBy,
          dueDate,
          appUrl: `${env.FRONTEND_URL}/indicators/${indicator._id}`,
        });
        await sendMail({ to: user.email, ...mail });
      }
    }

    await logActivity({
      user: req.user._id,
      action: "CREATE_INDICATOR",
      entity: indicatorTitle,
      entityId: indicator._id,
      level: "success",
    });

    res.status(201).json({ success: true, indicator });
  }
);

/* =====================================================
   SUBMIT EVIDENCE (AUTOMATION REMOVED)
===================================================== */
export const submitIndicatorEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const files = req.files?.files;
    if (!files || !files.length)
      return next(new ErrorHandler(400, "No files uploaded"));

    const descriptions: string[] = Array.isArray(req.body.descriptions)
      ? req.body.descriptions
      : [req.body.description || ""];

    const evidence: IEvidence[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (
        file.mimetype === "application/zip" ||
        file.originalname.endsWith(".zip")
      ) {
        const zip = new AdmZip(file.buffer);
        const zipEntries = zip.getEntries();

        for (const zipEntry of zipEntries) {
          if (zipEntry.isDirectory) continue;
          const fileName = zipEntry.entryName;
          const fileBuffer = zipEntry.getData();
          const upload = await uploadToCloudinary(
            fileBuffer,
            "indicators",
            path.parse(fileName).name
          );

          evidence.push({
            type: "file",
            fileName,
            fileSize: fileBuffer.length,
            mimeType: "application/octet-stream",
            publicId: upload.public_id,
            resourceType: normalizeResourceType(upload.resource_type),
            cloudinaryType: normalizeCloudinaryType(upload.type),
            format: upload.format || "bin",
            secureUrl: upload.secure_url,
            description: descriptions[i] || "",
          });
        }
      } else {
        const upload = await uploadToCloudinary(
          file.buffer,
          "indicators",
          path.parse(file.originalname).name
        );
        evidence.push({
          type: "file",
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          publicId: upload.public_id,
          resourceType: normalizeResourceType(upload.resource_type),
          cloudinaryType: normalizeCloudinaryType(upload.type),
          format: upload.format || "bin",
          secureUrl: upload.secure_url,
          description: descriptions[i] || "",
        });
      }
    }

    indicator.evidence.push(...evidence);

    // We update status to SUBMITTED so the admin knows there is new work to review,
    // but we NO LONGER touch indicator.progress here.
    indicator.status = STATUS.SUBMITTED;

    await indicator.save();
    res.json({ success: true, indicator });
  }
);

/* =====================================================
   DOWNLOAD EVIDENCE
===================================================== */
export const downloadEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { indicatorId, publicId } = req.params;

    const indicator = await Indicator.findById(indicatorId);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const evidence = indicator.evidence.find(
      (e) => e.publicId === decodeURIComponent(publicId)
    );
    if (!evidence) return next(new ErrorHandler(404, "Evidence not found"));

    const signedUrl = cloudinary.utils.private_download_url(
      evidence.publicId,
      evidence.format,
      {
        resource_type: evidence.resourceType,
        type: evidence.cloudinaryType,
        expires_at: Math.floor(Date.now() / 1000) + 60,
      }
    );

    const response = await axios.get(signedUrl, { responseType: "stream" });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${evidence.fileName}"`
    );
    res.setHeader(
      "Content-Type",
      response.headers["content-type"] || "application/octet-stream"
    );

    response.data.pipe(res);
  }
);

/* =====================================================
   UPDATE INDICATOR
===================================================== */
export const updateIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["admin", "superadmin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    // 1. Destructure to extract notes string and prevent Object.assign from crashing
    const { notes, ...otherData } = req.body;

    // 2. Assign standard fields (title, dates, etc.)
    Object.assign(indicator, otherData);

    // 3. Manually push note if it's provided as a string
    if (notes && typeof notes === "string") {
      indicator.notes.push({
        text: notes,
        createdBy: req.user._id,
        createdAt: new Date(),
      });
    }

    await indicator.save();

    await logActivity({
      user: req.user._id,
      action: "UPDATE_INDICATOR",
      entity: indicator.indicatorTitle,
      entityId: indicator._id,
      level: "info",
    });

    res.json({ success: true, indicator });
  }
);

/* =====================================================
   DELETE INDICATOR
===================================================== */
export const deleteIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["superadmin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Not found"));

    await indicator.deleteOne();

    await logActivity({
      user: req.user._id,
      action: "DELETE_INDICATOR",
      entity: indicator.indicatorTitle,
      level: "warn",
    });

    res.json({ success: true });
  }
);

/* =====================================================
   GETTERS
===================================================== */
export const getIndicatorById = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ success: false });

    const indicator = await Indicator.findById(req.params.id)
      .populate("category level2Category", "title")
      .populate("createdBy reviewedBy", "name email")
      .lean();

    if (!indicator) return res.status(404).json({ success: false });

    res.json({ success: true, indicator });
  }
);

export const getAllIndicators = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ success: false });

    if (!hasRole(req.user.role, ["admin", "superadmin"]))
      return res.status(403).json({ success: false });

    const indicators = await Indicator.find()
      .populate("category level2Category", "title")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, indicators });
  }
);

export const getSubmittedIndicators = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ success: false });

    if (!hasRole(req.user.role, ["admin", "superadmin"]))
      return res.status(403).json({ success: false });

    const indicators = await Indicator.find({
      status: { $in: [STATUS.PENDING, STATUS.SUBMITTED, STATUS.APPROVED] },
    })
      .populate("category level2Category", "title")
      .populate("createdBy reviewedBy", "name email")
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ success: true, indicators });
  }
);

export const getUserIndicators = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ success: false });

    const indicators = await Indicator.find({
      $or: [{ assignedTo: req.user._id }, { assignedGroup: req.user._id }],
    })
      .populate("category level2Category", "title")
      .sort({ dueDate: 1 })
      .lean();

    res.json({ success: true, indicators });
  }
);

/* =====================================================
   MANUAL PROGRESS UPDATE (ADMIN ONLY)
===================================================== */
export const updateIndicatorProgress = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Auth & Role Check: Only Admin/Superadmin can grade progress
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["admin", "superadmin"])) {
      return next(
        new ErrorHandler(
          403,
          "Only administrators can update progress percentages."
        )
      );
    }

    const { id } = req.params;
    const { progress } = req.body; // 2. Validation

    if (progress === undefined || progress < 0 || progress > 100) {
      return next(
        new ErrorHandler(
          400,
          "Please provide a progress value between 0 and 100."
        )
      );
    }

    const indicator = await Indicator.findById(id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found.")); // 3. Apply manual progress ONLY

    // We explicitly DO NOT change the status here, even if progress is 100.
    indicator.progress = progress;

    await indicator.save();

    await logActivity({
      user: req.user._id,
      action: "UPDATE_PROGRESS_MANUAL",
      entity: indicator.indicatorTitle,
      entityId: indicator._id,
      level: "info",
    });

    res.status(200).json({
      success: true,
      message: `Progress updated to ${progress}% by Admin. Status remains ${indicator.status}.`,
      indicator,
    });
  }
);


/* =====================================================
   REVIEW / APPROVAL / REJECTION HANDLER (FINAL)
===================================================== */
const reviewIndicator = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  status: StatusType
) => {
  /* ---------------------------------------------------
     0. Auth & Role Enforcement
  --------------------------------------------------- */
  if (!req.user) {
    return next(new ErrorHandler(401, "Unauthorized"));
  }

  if (!hasRole(req.user.role, ["admin", "superadmin"])) {
    return next(
      new ErrorHandler(403, "Only administrators can review indicators")
    );
  }

  /* ---------------------------------------------------
     1. Find Indicator
  --------------------------------------------------- */
  const indicator = await Indicator.findById(req.params.id);
  if (!indicator) {
    return next(new ErrorHandler(404, "Indicator not found"));
  }

  /* ---------------------------------------------------
     2. Extract Inputs
  --------------------------------------------------- */
  const {
    notes,
    reportData,
  }: {
    notes?: string;
    reportData?: Record<string, unknown>;
  } = req.body;

  /* ---------------------------------------------------
     3. Rejection Validation (FAIL FAST)
  --------------------------------------------------- */
  if (status === STATUS.REJECTED) {
    if (!notes || notes.trim().length === 0) {
      return next(
        new ErrorHandler(
          400,
          "Rejection requires a clear remark explaining the reason."
        )
      );
    }
  }

  /* ---------------------------------------------------
     4. Apply Review Metadata (SOURCE OF TRUTH)
  --------------------------------------------------- */
  indicator.status = status;
  indicator.reviewedBy = req.user._id;
  indicator.reviewedAt = new Date();

  if (reportData) {
    indicator.reportData = reportData;
  }

  /* ---------------------------------------------------
     5. Append Review Note (Immutable History)
  --------------------------------------------------- */
  if (notes && typeof notes === "string") {
    indicator.notes.push({
      text: notes.trim(),
      createdBy: req.user._id,
      createdAt: new Date(),
    });
  }

  /* ---------------------------------------------------
     6. Enforce Outcome & Progress (NO FRONTEND TRUST)
  --------------------------------------------------- */
  switch (status) {
    case STATUS.APPROVED:
      indicator.progress = 100;
      indicator.result = "pass";
      break;

    case STATUS.REJECTED:
      indicator.progress = 0;
      indicator.result = "fail";
      break;
  }

  /* ---------------------------------------------------
     7. Persist (Model Guards Transitions & Integrity)
  --------------------------------------------------- */
  await indicator.save();

  /* ---------------------------------------------------
     8. Return Fully Populated Indicator
  --------------------------------------------------- */
  const populatedIndicator = await Indicator.findById(indicator._id)
    .populate("category level2Category", "title")
    .populate("createdBy reviewedBy", "name email")
    .populate("notes.createdBy", "name")
    .lean({ virtuals: true });

  res.status(200).json({
    success: true,
    indicator: populatedIndicator,
  });
};


/**
 * Super Admin final approval.
 * Moves status to APPROVED and locks progress at 100%.
 */
export const approveIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    return reviewIndicator(req, res, next, STATUS.APPROVED);
  }
);

/**
 * Super Admin rejection.
 * Moves status to REJECTED.
 */
export const rejectIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    return reviewIndicator(req, res, next, STATUS.REJECTED);
  }
);
