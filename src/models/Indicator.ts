import mongoose, { Schema, Model, Types, HydratedDocument } from "mongoose";

/* =====================================================
   TYPES & CONSTANTS
===================================================== */

export const INDICATOR_STATUS = [
  "pending",
  "submitted",
  "partially_completed",
  "approved",
  "completed",
  "rejected",
  "overdue",
] as const;
export type IndicatorStatus = (typeof INDICATOR_STATUS)[number];

export const EVIDENCE_STATUS = ["active", "rejected", "archived"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUS)[number];

/* =====================================================
   INTERFACES
===================================================== */

interface IAuditFields {
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export interface IEvidence {
  _id: Types.ObjectId;
  type: "file";
  fileName: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  publicId: string;
  resourceType: "raw" | "image" | "video";
  cloudinaryType: "authenticated" | "upload";
  format: string;
  version: number;
  status: EvidenceStatus;
  isArchived: boolean;
  isResubmission: boolean;
  resubmissionAttempt: number;
  archivedAt?: Date;
  uploadedAt: Date;
  uploadedBy?: Types.ObjectId;
}

export interface INote extends IAuditFields {
  text: string;
}

export interface IScoreHistory {
  score: number;
  submittedBy: Types.ObjectId;
  submittedAt: Date;
}

export interface IEditHistory {
  updatedBy: Types.ObjectId;
  updatedAt: Date;
  changes: Record<string, { old: any; new: any }>;
}

export interface IIndicator {
  category: Types.ObjectId;
  level2Category: Types.ObjectId;
  indicatorTitle: string;
  unitOfMeasure: string;
  assignedToType: "individual" | "group";
  assignedTo?: Types.ObjectId | null;
  assignedGroup?: Types.ObjectId[];
  startDate: Date;
  dueDate: Date;
  nextDeadline?: Date;
  progress: number;
  notes: INote[];
  evidence: IEvidence[];
  editHistory: IEditHistory[];
  scoreHistory: IScoreHistory[];
  createdBy: Types.ObjectId;
  status: IndicatorStatus;
  rejectionCount: number;
  result?: "pass" | "fail" | null;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  reportData?: Record<string, unknown>;
  calendarEvent?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IndicatorDocument = HydratedDocument<IIndicator>;

/* =====================================================
   SUB-SCHEMAS
===================================================== */

const evidenceSchema = new Schema<IEvidence>(
  {
    type: { type: String, enum: ["file"], required: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    description: { type: String, default: "" },
    publicId: { type: String, required: true },
    resourceType: {
      type: String,
      enum: ["raw", "image", "video"],
      required: true,
    },
    cloudinaryType: {
      type: String,
      enum: ["authenticated", "upload"],
      required: true,
    },
    format: { type: String, required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: EVIDENCE_STATUS, default: "active" },
    isArchived: { type: Boolean, default: false },
    isResubmission: { type: Boolean, default: false },
    resubmissionAttempt: { type: Number, default: 0 },
    archivedAt: Date,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true },
);

const noteSchema = new Schema<INote>(
  {
    text: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/* =====================================================
   MAIN SCHEMA
===================================================== */

const indicatorSchema = new Schema<IIndicator>(
  {
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    level2Category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    indicatorTitle: { type: String, required: true, trim: true },
    unitOfMeasure: { type: String, required: true },
    assignedToType: {
      type: String,
      enum: ["individual", "group"],
      required: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assignedGroup: [{ type: Schema.Types.ObjectId, ref: "User" }],
    startDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    nextDeadline: Date,
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
      set: (v: number) => Math.round(v),
    },
    notes: [noteSchema],
    evidence: [evidenceSchema],
    editHistory: [
      new Schema(
        {
          updatedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          updatedAt: { type: Date, default: Date.now },
          changes: { type: Schema.Types.Mixed, required: true },
        },
        { _id: false },
      ),
    ],
    scoreHistory: [
      new Schema(
        {
          score: { type: Number, required: true, min: 0, max: 100 },
          submittedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          submittedAt: { type: Date, default: Date.now },
        },
        { _id: false },
      ),
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: INDICATOR_STATUS, default: "pending" },
    rejectionCount: { type: Number, default: 0 },
    result: { type: String, enum: ["pass", "fail"], default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reportData: { type: Schema.Types.Mixed, default: {} },
    calendarEvent: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

/* =====================================================
   INDEXES & MIDDLEWARE
===================================================== */

indicatorSchema.index({ status: 1, dueDate: 1 });

/**
 * Updated Middleware:
 * Using an async function without the 'next' parameter.
 * Mongoose will automatically wait for the returned promise to resolve.
 */
indicatorSchema.pre("save", async function () {
  if (this.isModified("evidence")) {
    this.evidence.forEach((ev) => {
      if (!ev.uploadedBy) {
        ev.uploadedBy = (this.assignedTo as Types.ObjectId) || this.createdBy;
      }
    });
  }
});

export const Indicator: Model<IIndicator> =
  mongoose.models.Indicator ||
  mongoose.model<IIndicator>("Indicator", indicatorSchema);
