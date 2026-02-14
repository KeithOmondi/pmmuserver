import { Request } from "express";
import Joi from "joi";
import { Types } from "mongoose";
import ErrorHandler from "../middleware/errorMiddlewares";
import { Category, ICategory } from "../models/Category";
import { IEvidence } from "../models/Indicator";

/* =====================================================
   STATUS & CONSTANTS
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

/* =====================================================
   VALIDATION HELPERS
===================================================== */
export const hasRole = (role: string | undefined, allowed: string[]) =>
  !!role && allowed.map((r) => r.toLowerCase()).includes(role.toLowerCase());

const objectId = Joi.string().hex().length(24);

export const createIndicatorSchema = Joi.object({
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
  const hasGroup = Array.isArray(value.assignedGroup) && value.assignedGroup.length > 0;
  if (!hasIndividual && !hasGroup) {
    return helpers.error("any.custom", {
      message: "At least one assignee is required",
    });
  }
  return value;
});

/* =====================================================
   BUSINESS LOGIC HELPERS
===================================================== */

/**
 * Validates the category hierarchy exists and is correctly nested
 */
export const validateCategories = async (categoryId: string, level2Id: string) => {
  const [main, level2] = await Promise.all([
    Category.findById(categoryId).lean<ICategory>(),
    Category.findById(level2Id).lean<ICategory>(),
  ]);

  if (!main || main.level !== 1) throw new ErrorHandler(400, "Invalid main category");
  if (!level2 || level2.level !== 2) throw new ErrorHandler(400, "Invalid level 2 category");

  if (String(level2.parent) !== String(main._id)) {
    throw new ErrorHandler(400, "Category hierarchy mismatch");
  }
};

/**
 * Resolves the title of the Level 3 Category (The Indicator)
 */
export const resolveIndicatorTitle = async (indicatorId: string) => {
  const indicator = await Category.findById(indicatorId).lean<ICategory>();
  if (!indicator || indicator.level !== 3) throw new ErrorHandler(400, "Invalid indicator");
  return indicator.title;
};

/**
 * Builds the evidence object for Mongoose insertion
 */
export const buildEvidence = (
  upload: any,
  fileName: string,
  fileSize: number,
  mimeType: string,
  uploadedBy: Types.ObjectId,
  description = "",
  attempt = 0
): IEvidence => {
  return {
    _id: new Types.ObjectId(),
    type: "file",
    fileName,
    fileSize,
    mimeType,
    description,
    publicId: upload.public_id,
    resourceType: upload.resource_type,
    cloudinaryType: upload.type,
    format: upload.format,
    version: upload.version,
    status: "active",
    isArchived: false,
    isResubmission: attempt > 0,
    resubmissionAttempt: attempt,
    uploadedAt: new Date(),
    uploadedBy,
  };
};