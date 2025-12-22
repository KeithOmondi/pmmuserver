import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { Types } from "mongoose";
import { Category, ICategory } from "../models/Category";
import { Indicator, IIndicator, IEvidence } from "../models/Indicator";
import { catchAsyncErrors } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../middleware/errorMiddlewares";
import { uploadToCloudinary } from "../utils/cloudinary";
import { logActivity } from "../utils/activityLogger";
import { notifyUser } from "../services/notification.service";

/* ================================================
   STATUS CONSTANTS
================================================ */
const STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  OVERDUE: "overdue",
} as const;

type StatusType = (typeof STATUS)[keyof typeof STATUS];

/* ================================================
   AUTH TYPES
================================================ */
export type MinimalUser = {
  _id: Types.ObjectId;
  role?: string;
};

export type AuthenticatedRequest = Request & {
  user?: MinimalUser;
};

/* ================================================
   ROLE HELPER
================================================ */
const hasRole = (userRole: string | undefined, roles: string[]) => {
  if (!userRole) return false;
  return roles.map((r) => r.toLowerCase()).includes(userRole.toLowerCase());
};

/* ================================================
   VALIDATION SCHEMA
================================================ */
const indicatorValidator = Joi.object({
  categoryId: Joi.string().required(),
  level2CategoryId: Joi.string().required(),
  indicatorId: Joi.string().required(),
  unitOfMeasure: Joi.string().max(100).required(),
  assignedToType: Joi.string().valid("individual", "group").required(),
  assignedTo: Joi.string().optional(),
  assignedGroup: Joi.array().items(Joi.string()).optional(),
  startDate: Joi.date().required(),
  dueDate: Joi.date().greater(Joi.ref("startDate")).required(),
  notes: Joi.alternatives().try(Joi.string(), Joi.array()).optional(),
  calendarEvent: Joi.object().optional(),
});

/* ================================================
   CATEGORY VALIDATION HELPERS
================================================ */
const validateCategories = async (categoryId: string, level2Id: string) => {
  const main = await Category.findById(categoryId).lean<ICategory>();
  if (!main) throw new ErrorHandler(404, "Main category not found");
  if (main.level !== 1)
    throw new ErrorHandler(400, "Main category must be level 1");

  const level2 = await Category.findById(level2Id).lean<ICategory>();
  if (!level2) throw new ErrorHandler(404, "Level 2 category not found");
  if (level2.level !== 2)
    throw new ErrorHandler(400, "Level 2 category must be level 2");

  if (String(level2.parent) !== String(main._id))
    throw new ErrorHandler(
      400,
      "Level 2 category does not belong under main category"
    );

  return { main, level2 };
};

const resolveIndicatorTitle = async (indicatorId: string) => {
  const level3 = await Category.findById(indicatorId).lean<ICategory>();
  if (!level3 || level3.level !== 3)
    throw new ErrorHandler(400, "Invalid Level 3 indicator");
  return level3.title;
};

/* ================================================
   CREATE INDICATOR
================================================ */
export const createIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["superadmin"]))
      return next(
        new ErrorHandler(403, "Only SuperAdmin can create indicators")
      );

    const { error, value } = indicatorValidator.validate(req.body, {
      abortEarly: false,
      allowUnknown: true,
    });

    if (error || !value)
      return next(
        new ErrorHandler(400, error?.details[0]?.message || "Invalid input")
      );

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
      notes,
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
      assignedGroup: assignedGroup || [],
      startDate,
      dueDate,
      notes: notes || [],
      evidence: [],
      createdBy: req.user._id,
      status: STATUS.PENDING,
      calendarEvent,
    });

    /** 🔔 NOTIFICATIONS: Assigned Users */
    const assignedUsers =
      assignedToType === "individual" ? [assignedTo] : assignedGroup || [];

    for (const userId of assignedUsers) {
      await notifyUser({
        userId: new Types.ObjectId(userId),
        title: "New Indicator Assigned",
        message: `You have been assigned: ${indicatorTitle}`,
        type: "assignment",
        metadata: { indicatorId: indicator._id },
      });
    }

    /** 📝 ACTIVITY LOG */
    await logActivity({
      user: req.user._id,
      action: "CREATE_INDICATOR",
      entity: "Indicator",
      entityId: indicator._id,
      meta: { assignedToType },
    });

    res.status(201).json({ success: true, indicator });
  }
);

/* ================================================
   UPDATE INDICATOR
================================================ */
export const updateIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["superadmin", "admin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

    Object.assign(indicator, req.body);
    await indicator.save();

    res.status(200).json({ success: true, indicator });
  }
);

/* ================================================
   GET INDICATORS ASSIGNED TO USER
================================================ */
export const getUserIndicators = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const userId = req.user._id;

    const indicators = await Indicator.find({
      $or: [
        { assignedToType: "individual", assignedTo: userId },
        { assignedToType: "group", assignedGroup: { $in: [userId] } },
      ],
    })
      .populate("category", "title code parent level")
      .populate("level2Category", "title code parent level")
      .populate("createdBy", "name email")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })
      .lean<IIndicator[]>();

    res.status(200).json({ success: true, indicators });
  }
);

/* ================================================
   GET SINGLE INDICATOR
================================================ */
export const getIndicatorById = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const indicator = await Indicator.findById(req.params.id)
      .populate("category level2Category", "title code")
      .populate("createdBy", "name email")
      .lean();

    if (!indicator)
      return res.status(404).json({ success: false, message: "Not found" });

    const canView =
      hasRole(req.user.role, ["superadmin", "admin"]) ||
      indicator.assignedTo?.toString() === req.user._id.toString() ||
      indicator.assignedGroup?.some(
        (u) => u.toString() === req.user!._id.toString()
      );

    if (!canView)
      return res.status(403).json({ success: false, message: "Forbidden" });

    res.status(200).json({ success: true, indicator });
  }
);

/* ================================================
   DELETE INDICATOR
================================================ */
export const deleteIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return next(new ErrorHandler(404, "Not found"));

    if (
      hasRole(req.user.role, ["admin"]) &&
      indicator.createdBy.toString() !== req.user._id.toString()
    )
      return next(new ErrorHandler(403, "Forbidden"));

    await indicator.deleteOne();

    res.status(200).json({ success: true });
  }
);

/* ================================================
   GET ALL INDICATORS (ADMIN)
================================================ */
export const getAllIndicators = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    if (!hasRole(req.user.role, ["superadmin", "admin"]))
      return res.status(403).json({ success: false, message: "Forbidden" });

    const indicators = await Indicator.find()
      .populate("category level2Category", "title code")
      .populate("createdBy", "name email")
      .lean<IIndicator[]>();

    res.status(200).json({ success: true, indicators });
  }
);

/* ================================================
   SUBMIT INDICATOR EVIDENCE
================================================ */
export const submitIndicatorEvidence = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const userId = req.user._id; // ✅ safe because of the check above

    const indicator = await Indicator.findById(req.params.id);
    if (!indicator)
      return res.status(404).json({ success: false, message: "Not found" });

    // Check assignment
    const isAssigned =
      indicator.assignedTo?.toString() === userId.toString() ||
      indicator.assignedGroup?.some((u) => u.toString() === userId.toString());

    if (!isAssigned)
      return res.status(403).json({ success: false, message: "Forbidden" });

    if (!req.files || !Array.isArray(req.files))
      return res.status(400).json({ success: false, message: "No files" });

    const descriptions: string[] = Array.isArray(req.body.descriptions)
      ? req.body.descriptions
      : [];

    const uploadedFiles: IEvidence[] = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i] as Express.Multer.File;
      const upload = await uploadToCloudinary(
        file.buffer,
        "indicators",
        file.originalname
      );

      uploadedFiles.push({
        type: "file",
        fileUrl: upload.secure_url,
        publicId: upload.public_id,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        description: descriptions[i] || "",
      });
    }

    // Update indicator
    indicator.evidence.push(...uploadedFiles);
    indicator.progress = Math.min(100, indicator.evidence.length * 10);
    await indicator.save();

    /** 🔔 NOTIFICATIONS: Notify creator/admin and assigned users */
    const notifyPromises: Promise<any>[] = [];

    if (indicator.createdBy) {
      notifyPromises.push(
        notifyUser({
          userId: indicator.createdBy,
          title: "Indicator Evidence Submitted",
          message: `${userId.toString()} submitted evidence for "${
            indicator.indicatorTitle
          }"`,
          type: "assignment",
          metadata: { indicatorId: indicator._id },
        })
      );
    }

    // Notify all assigned users except the submitter
    const assignedUsers =
      indicator.assignedToType === "individual"
        ? [indicator.assignedTo]
        : indicator.assignedGroup || [];

    assignedUsers.forEach((assignedUserId) => {
      if (assignedUserId && assignedUserId.toString() !== userId.toString()) {
        notifyPromises.push(
          notifyUser({
            userId: new Types.ObjectId(assignedUserId),
            title: "New Evidence Submitted",
            message: `New evidence submitted for "${indicator.indicatorTitle}"`,
            type: "assignment",
            metadata: { indicatorId: indicator._id },
          })
        );
      }
    });

    await Promise.all(notifyPromises);

    /** 📝 ACTIVITY LOG */
    await logActivity({
      user: userId,
      action: "SUBMIT_EVIDENCE",
      entity: "Indicator",
      entityId: indicator._id,
      meta: { files: uploadedFiles.length },
    });

    res.status(200).json({ success: true, indicator });
  }
);

/* ================================================
   APPROVE / REJECT INDICATOR
================================================ */
const handleReviewStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  status: StatusType
) => {
  if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
  if (!hasRole(req.user.role, ["superadmin", "admin"]))
    return next(new ErrorHandler(403, "Admins only"));

  const indicator = await Indicator.findById(req.params.id);
  if (!indicator) return next(new ErrorHandler(404, "Indicator not found"));

  indicator.status = status;
  indicator.reviewedBy = req.user._id;
  indicator.reviewedAt = new Date();
  await indicator.save();

  res.status(200).json({ success: true, indicator });
};

export const approveIndicator = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => handleReviewStatus(req, res, next, STATUS.APPROVED);

export const rejectIndicator = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => handleReviewStatus(req, res, next, STATUS.REJECTED);
