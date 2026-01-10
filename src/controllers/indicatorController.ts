import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { Types } from "mongoose";
import { Category, ICategory } from "../models/Category";
import { Indicator, IEvidence } from "../models/Indicator";
import { catchAsyncErrors } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../middleware/errorMiddlewares";
import { uploadToCloudinary, cloudinary } from "../utils/cloudinary";
import { logActivity } from "../utils/activityLogger";
import { notifyUser } from "../services/notification.service";
import axios from "axios";

/* =====================================
   STATUS CONSTANTS
===================================== */
export const STATUS = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  COMPLETED: "completed",
  REJECTED: "rejected",
  OVERDUE: "overdue",
} as const;

export type StatusType = (typeof STATUS)[keyof typeof STATUS];

/* =====================================
   AUTH TYPES
===================================== */
export type MinimalUser = {
  _id: Types.ObjectId;
  role?: string;
};

export type AuthenticatedRequest = Request & {
  user?: MinimalUser;
};

/* =====================================
   ROLE HELPER
===================================== */
const hasRole = (role: string | undefined, roles: string[]) => {
  if (!role) return false;
  return roles.map((r) => r.toLowerCase()).includes(role.toLowerCase());
};

/* =====================================
   VALIDATION
===================================== */
const createIndicatorSchema = Joi.object({
  categoryId: Joi.string().required(),
  level2CategoryId: Joi.string().required(),
  indicatorId: Joi.string().required(),
  unitOfMeasure: Joi.string().required(),
  assignedToType: Joi.string().valid("individual", "group").required(),
  assignedTo: Joi.string().optional(),
  assignedGroup: Joi.array().items(Joi.string()).optional(),
  startDate: Joi.date().required(),
  dueDate: Joi.date().greater(Joi.ref("startDate")).required(),
  calendarEvent: Joi.object().optional(),
});

/* =====================================
   CATEGORY HELPERS
===================================== */
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
  const level3 = await Category.findById(indicatorId).lean<ICategory>();
  if (!level3 || level3.level !== 3)
    throw new ErrorHandler(400, "Invalid indicator");
  return level3.title;
};

/* =====================================
   CREATE INDICATOR
===================================== */
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
      createdBy: req.user._id,
      status: STATUS.PENDING,
      calendarEvent: calendarEvent || null,
    });

    // --- ACTIVITY LOG ---
    await logActivity({
      user: req.user._id,
      action: "CREATE_INDICATOR",
      entity: indicatorTitle,
      entityId: indicator._id,
      level: "success",
    });

    // --- NOTIFICATION ---
    const targetUsers = assignedTo ? [assignedTo] : assignedGroup || [];
    for (const targetId of targetUsers) {
      await notifyUser({
        userId: new Types.ObjectId(targetId),
        submittedBy: req.user._id,
        title: "New Performance Indicator Assigned",
        message: `You have been assigned: ${indicatorTitle}. Due date: ${new Date(
          dueDate
        ).toLocaleDateString()}`,
        type: "assignment",
        metadata: { indicatorId: indicator._id },
      });
    }

    res.status(201).json({ success: true, indicator });
  }
);

/* =====================================
   UPDATE INDICATOR
===================================== */
export const updateIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["admin", "superadmin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    Object.assign(indicator, req.body);
    await indicator.save();

    // --- ACTIVITY LOG ---
    await logActivity({
      user: req.user._id,
      action: "UPDATE_INDICATOR",
      entity: indicator.indicatorTitle,
      entityId: indicator._id,
      level: "info",
    });

    res.status(200).json({ success: true, indicator });
  }
);

/* =====================================
   DELETE INDICATOR
===================================== */
export const deleteIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["superadmin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Not found"));

    const title = indicator.indicatorTitle;
    await indicator.deleteOne();

    // --- ACTIVITY LOG ---
    await logActivity({
      user: req.user._id,
      action: "DELETE_INDICATOR",
      entity: title,
      level: "warn",
    });

    res.status(200).json({ success: true });
  }
);

/* =====================================
   GET SINGLE INDICATOR
===================================== */
export const getIndicatorById = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ success: false });

    const indicator = await Indicator.findById(req.params.id)
      .populate("category level2Category", "title")
      .populate("createdBy reviewedBy", "name email")
      .lean();

    if (!indicator) return res.status(404).json({ success: false });

    res.status(200).json({ success: true, indicator });
  }
);

/* =====================================
   GET ALL INDICATORS (ADMIN)
===================================== */
export const getAllIndicators = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ success: false });
    if (!hasRole(req.user.role, ["admin", "superadmin"]))
      return res.status(403).json({ success: false });

    const indicators = await Indicator.find()
      .populate("category level2Category", "title")
      .lean();

    res.status(200).json({ success: true, indicators });
  }
);

/* =====================================
   GET SUBMITTED INDICATORS (ADMIN)
===================================== */
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

    res.status(200).json({ success: true, indicators });
  }
);

/* =====================================
   GET INDICATORS ASSIGNED TO USER
===================================== */
export const getUserIndicators = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const userId = req.user._id;

    const indicators = await Indicator.find({
      $or: [{ assignedTo: userId }, { assignedGroup: userId }],
    })
      .populate("category level2Category", "title")
      .sort({ dueDate: 1 })
      .lean();

    res.status(200).json({ success: true, indicators });
  }
);

/* =====================================
   DOWNLOAD EVIDENCE
===================================== */
export const downloadEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));

    const { indicatorId, publicId } = req.params;

    const indicator = await Indicator.findById(indicatorId);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const userId = req.user._id;
    const isAssigned =
      indicator.assignedTo?.equals(userId) ||
      indicator.assignedGroup.some((id) => id.equals(userId));

    if (!isAssigned && !hasRole(req.user.role, ["admin", "superadmin"])) {
      return next(new ErrorHandler(403, "Access denied"));
    }

    const evidence = indicator.evidence.find((e) => e.publicId === publicId);
    if (!evidence) return next(new ErrorHandler(404, "Evidence not found"));

    const signedUrl = cloudinary.url(publicId, {
      resource_type: "raw",
      secure: true,
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });

    const response = await axios.get(signedUrl, {
      responseType: "stream",
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${evidence.fileName}"`
    );
    res.setHeader("Content-Type", response.headers["content-type"]);

    response.data.pipe(res);
  }
);

/* =====================================
   SUBMIT EVIDENCE
===================================== */
export const submitIndicatorEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    const files = (req.files as { [key: string]: Express.Multer.File[] })
      ?.files;

    if (!files || !files.length) {
      return next(new ErrorHandler(400, "No files uploaded"));
    }

    const evidence: IEvidence[] = [];

    for (const file of files) {
      const upload = await uploadToCloudinary(
        file.buffer,
        "indicators",
        file.originalname
      );

      evidence.push({
        type: "file",
        fileUrl: upload.secure_url,
        publicId: upload.public_id,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
      });
    }

    indicator.evidence.push(...evidence);
    indicator.status = STATUS.SUBMITTED;
    indicator.progress = Math.min(100, indicator.evidence.length * 10);

    await indicator.save();

    // --- ACTIVITY LOG ---
    await logActivity({
      user: req.user._id,
      action: "SUBMIT_EVIDENCE",
      entity: indicator.indicatorTitle,
      entityId: indicator._id,
      level: "info",
    });

    // --- NOTIFICATION ---
    // Notify the admin who created the indicator that work has been submitted
    await notifyUser({
      userId: indicator.createdBy,
      submittedBy: req.user._id,
      title: "Evidence Submitted for Review",
      message: `A user has submitted evidence for: ${indicator.indicatorTitle}.`,
      type: "system",
      metadata: { indicatorId: indicator._id },
    });

    res.status(200).json({ success: true, indicator });
  }
);

/* =====================================
   REVIEW (APPROVE / REJECT)
===================================== */
const reviewIndicator = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  status: StatusType
) => {
  if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
  if (!hasRole(req.user.role, ["admin", "superadmin"]))
    return next(new ErrorHandler(403, "Forbidden"));

  const indicator = await Indicator.findById(req.params.id);
  if (!indicator) return next(new ErrorHandler(404, "Not found"));

  indicator.status = status;
  indicator.reviewedBy = req.user._id;
  indicator.reviewedAt = new Date();
  await indicator.save();

  // --- ACTIVITY LOG ---
  await logActivity({
    user: req.user._id,
    action:
      status === STATUS.APPROVED ? "APPROVE_INDICATOR" : "REJECT_INDICATOR",
    entity: indicator.indicatorTitle,
    entityId: indicator._id,
    level: status === STATUS.APPROVED ? "success" : "error",
  });

  // --- NOTIFICATION ---
  // Notify the assigned users about the review outcome
  const targetUsers = indicator.assignedTo
    ? [indicator.assignedTo]
    : indicator.assignedGroup || [];
  for (const targetId of targetUsers) {
    await notifyUser({
      userId: targetId,
      submittedBy: req.user._id,
      title:
        status === STATUS.APPROVED
          ? "Submission Approved"
          : "Submission Rejected",
      message:
        status === STATUS.APPROVED
          ? `Your submission for ${indicator.indicatorTitle} has been accepted.`
          : `Your submission for ${indicator.indicatorTitle} was rejected. Please review and resubmit.`,
      type: status === STATUS.APPROVED ? "approval" : "rejection",
      metadata: { indicatorId: indicator._id },
    });
  }

  res.status(200).json({ success: true, indicator });
};

export const approveIndicator = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => reviewIndicator(req, res, next, STATUS.APPROVED);

export const rejectIndicator = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => reviewIndicator(req, res, next, STATUS.REJECTED);
