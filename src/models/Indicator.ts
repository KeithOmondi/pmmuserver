import mongoose, { Schema, Model, Types, HydratedDocument } from "mongoose";

/* =====================================================
   TYPES & INTERFACES
===================================================== */

export type IndicatorStatus =
  | "pending"
  | "submitted"
  | "partially_completed" // NEW
  | "approved"
  | "completed"
  | "rejected"
  | "overdue";

export type EvidenceStatus = "active" | "rejected" | "archived";

export interface IEvidence {
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

  /* === NEW FIELDS === */
  status: EvidenceStatus;
  isArchived: boolean;
  isResubmission: boolean;
  resubmissionAttempt: number;
  archivedAt?: Date;
  uploadedAt: Date;
}

export interface INote {
  text: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export interface IScoreHistory {
  score: number;
  submittedBy: Types.ObjectId;
  submittedAt: Date;
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
  nextDeadline?: Date; // NEW: for partial completion

  progress: number;

  notes: INote[];
  evidence: IEvidence[];

  createdBy: Types.ObjectId;
  status: IndicatorStatus;

  rejectionCount: number;
  result?: "pass" | "fail" | null;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;

  scoreHistory?: IScoreHistory[]; // NEW: track admin scores

  reportData?: Record<string, unknown>;
  calendarEvent?: Record<string, unknown> | null;

  createdAt: Date;
  updatedAt: Date;
}

export type IndicatorDocument = HydratedDocument<IIndicator>;

/* =====================================================
   SUB SCHEMAS
===================================================== */

const evidenceSchema = new Schema<IEvidence>(
  {
    type: { type: String, enum: ["file"], required: true },

    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    description: String,

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

    /* === AUDIT / RESUBMISSION === */
    status: {
      type: String,
      enum: ["active", "rejected", "archived"],
      default: "active",
    },

    isArchived: { type: Boolean, default: false },
    isResubmission: { type: Boolean, default: false },
    resubmissionAttempt: { type: Number, default: 0 },
    archivedAt: Date,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const noteSchema = new Schema<INote>(
  {
    text: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const scoreHistorySchema = new Schema<IScoreHistory>(
  {
    score: { type: Number, required: true, min: 0, max: 100 },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    submittedAt: { type: Date, default: Date.now },
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
    assignedGroup: { type: [Schema.Types.ObjectId], ref: "User", default: [] },

    startDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    nextDeadline: { type: Date }, // NEW

    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
      set: (v: number) => Math.round(v),
    },

    notes: { type: [noteSchema], default: [] },
    evidence: { type: [evidenceSchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    status: {
      type: String,
      enum: [
        "pending",
        "submitted",
        "partially_completed", // NEW
        "approved",
        "completed",
        "rejected",
        "overdue",
      ],
      default: "pending",
    },

    rejectionCount: { type: Number, default: 0 },
    result: { type: String, enum: ["pass", "fail"], default: null },

    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },

    scoreHistory: { type: [scoreHistorySchema], default: [] }, // NEW

    reportData: { type: Schema.Types.Mixed, default: {} },
    calendarEvent: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

/* =====================================================
   ASSIGNMENT VALIDATOR
===================================================== */

indicatorSchema.path("assignedGroup").validate(function () {
  const hasIndividual = !!this.assignedTo;
  const hasGroup =
    Array.isArray(this.assignedGroup) && this.assignedGroup.length > 0;

  return hasIndividual || hasGroup;
}, "At least one assignee (individual or group) is required");

/* =====================================================
   MODEL
===================================================== */

export const Indicator: Model<IIndicator> =
  mongoose.models.Indicator ||
  mongoose.model<IIndicator>("Indicator", indicatorSchema);
