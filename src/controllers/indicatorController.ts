import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { Types, HydratedDocument } from "mongoose";
import { Category, ICategory } from "../models/Category";
import { Indicator, IIndicator, IEvidence } from "../models/Indicator";
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
/* =====================================
   CREATE INDICATOR
===================================== */
export const createIndicator = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1️⃣ Ensure user is authenticated and has role
    if (!req.user) return next(new ErrorHandler(401, "Unauthorized"));
    if (!hasRole(req.user.role, ["superadmin"]))
      return next(new ErrorHandler(403, "Forbidden"));

    // 2️⃣ Validate client payload, strip unknown keys
    const { error, value } = createIndicatorSchema.validate(req.body, {
      stripUnknown: true, // removes any extra keys like indicatorTitle
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

    // 3️⃣ Validate category hierarchy
    await validateCategories(categoryId, level2CategoryId);

    // 4️⃣ Compute indicatorTitle server-side
    const indicatorTitle = await resolveIndicatorTitle(indicatorId);

    // 5️⃣ Create indicator
    const indicator = await Indicator.create({
      category: categoryId,
      level2Category: level2CategoryId,
      indicatorTitle, // server-computed
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

    // 6️⃣ Respond
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

    await indicator.deleteOne();
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

    // 🔐 Authenticated Cloudinary URL (SIGNED)
    const signedUrl = cloudinary.url(publicId, {
      resource_type: "raw",
      secure: true,
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 60, // 1 minute
    });

    // ⬇️ Stream file through backend
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

    const files = (req.files as { [key: string]: Express.Multer.File[] })?.files;

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
