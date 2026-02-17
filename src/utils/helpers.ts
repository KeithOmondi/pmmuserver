/* =====================================================
  UTILS / CENTRAL HELPERS
===================================================== */
import { Types } from "mongoose";
import { IEvidence } from "../models/Indicator";
import { Category } from "../models/Category";
import ErrorHandler from "../middleware/errorMiddlewares";
import { notifyUser } from "../services/notification.service";
import sendMail from "./sendMail";
import { indicatorCreatedTemplate } from "./mailTemplates";
import { env } from "../config/env";

/* =====================================================
  AUTH / ROLE HELPERS
===================================================== */
export const hasRole = (role: string | undefined, allowed: string[]) =>
  !!role && allowed.map(r => r.toLowerCase()).includes(role.toLowerCase());

/* =====================================================
  CATEGORY VALIDATION HELPERS
===================================================== */
export const validateCategories = async (categoryId: string, level2Id: string) => {
  const main = await Category.findById(categoryId).lean();
  if (!main || main.level !== 1) throw new ErrorHandler(400, "Invalid main category");

  const level2 = await Category.findById(level2Id).lean();
  if (!level2 || level2.level !== 2) throw new ErrorHandler(400, "Invalid level 2 category");

  if (String(level2.parent) !== String(main._id))
    throw new ErrorHandler(400, "Category hierarchy mismatch");
};

export const resolveIndicatorTitle = async (indicatorId: string) => {
  const indicator = await Category.findById(indicatorId).lean();
  if (!indicator || indicator.level !== 3) throw new ErrorHandler(400, "Invalid indicator");
  return indicator.title;
};

/* =====================================================
  EVIDENCE HELPERS
===================================================== */
export const buildEvidence = (
  upload: any,
  fileName: string,
  fileSize: number,
  mimeType: string,
  uploadedBy: Types.ObjectId,
  description = "",
  attempt = 0,
): IEvidence => ({
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
  // Fix: Ensure version is never undefined. 
  // If upload.version is missing, fallback to 1 or a timestamp.
  version: upload.version || Date.now(), 
  status: "active",
  isArchived: false,
  isResubmission: attempt > 0,
  resubmissionAttempt: attempt,
  uploadedAt: new Date(),
  uploadedBy,
});

/* =====================================================
  AUDIT / EDIT HISTORY HELPERS
===================================================== */
export const addEditHistory = (
  indicator: any,
  updatedBy: Types.ObjectId,
  changes: Record<string, { old: any; new: any }>
) => {
  if (Object.keys(changes).length > 0) {
    indicator.editHistory.push({
      updatedBy,
      updatedAt: new Date(),
      changes,
    });
  }
};

/* =====================================================
  NOTIFICATION HELPERS
===================================================== */
export const notifyAssignedUsers = async (
  assignedTo: string | null,
  assignedGroup: string[] = [],
  indicatorTitle: string,
  indicatorId: string,
  submittedBy: Types.ObjectId,
  assignedBy: string,
) => {
  const targets = new Set<string>();
  if (assignedTo) targets.add(assignedTo);
  assignedGroup.forEach(id => targets.add(id));

  for (const userId of targets) {
    await notifyUser({
      userId: new Types.ObjectId(userId),
      submittedBy,
      title: "New Indicator Assigned",
      message: indicatorTitle,
      type: "assignment",
      metadata: { indicatorId },
    });

    // Optional email
    // const user = await User.findById(userId).select("email");
    // if (user?.email) {
    //   const mail = indicatorCreatedTemplate({ indicatorTitle, assignedBy, appUrl: `${env.FRONTEND_URL}/user/indicators/${indicatorId}` });
    //   await sendMail({ to: user.email, ...mail });
    // }
  }
};
