import mongoose, { Schema, Model, Types, HydratedDocument } from "mongoose";

/* =====================================================
   TYPES & INTERFACES
===================================================== */

export type IndicatorStatus =
  | "pending"
  | "submitted"
  | "approved"
  | "completed"
  | "rejected"
  | "overdue";

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
  secureUrl?: string;
}

export interface INote {
  text: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export interface IIndicator {
  category: Types.ObjectId;
  level2Category: Types.ObjectId;
  indicatorTitle: string;
  unitOfMeasure: string;
  assignedToType: "individual" | "group";
  assignedTo?: Types.ObjectId;
  assignedGroup: Types.ObjectId[];
  startDate: Date;
  dueDate: Date;
  progress: number;
  notes: INote[];
  evidence: IEvidence[];
  createdBy: Types.ObjectId;
  status: IndicatorStatus;
  result?: "pass" | "fail" | null;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  reportData?: Record<string, unknown>;
  calendarEvent?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/* =====================================================
   DOCUMENT + VIRTUALS
===================================================== */

export interface IndicatorVirtuals {
  phase: string;
}

export type IndicatorDocument = HydratedDocument<IIndicator, IndicatorVirtuals>;

/* =====================================================
   SUB-SCHEMAS
===================================================== */

const evidenceSchema = new Schema<IEvidence>(
  {
    type: { type: String, enum: ["file"], required: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    description: { type: String },
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
    secureUrl: { type: String },
  },
  { _id: false }
);

const noteSchema = new Schema<INote>(
  {
    text: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/* =====================================================
   MAIN INDICATOR SCHEMA
===================================================== */

const indicatorSchema = new Schema<
  IIndicator,
  Model<IIndicator>,
  {},
  {},
  IndicatorVirtuals
>(
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
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    assignedGroup: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },

    startDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },

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
        "approved",
        "completed",
        "rejected",
        "overdue",
      ],
      default: "pending",
    },

    result: { type: String, enum: ["pass", "fail"], default: null },

    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },

    reportData: { type: Schema.Types.Mixed, default: {} },
    calendarEvent: { type: Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* =====================================================
   INDEXES
===================================================== */

indicatorSchema.index({ assignedTo: 1, status: 1 });
indicatorSchema.index({ assignedGroup: 1, status: 1 });
indicatorSchema.index({ category: 1, dueDate: 1 });

/* =====================================================
   VALIDATION & BUSINESS RULES
===================================================== */

indicatorSchema.pre("save", function () {
  // Assignment integrity
  if (this.assignedToType === "individual" && !this.assignedTo) {
    throw new Error("Assignee is required when type is set to individual");
  }

  // Rejection enforcement (AUDIT-CRITICAL)
  if (this.status === "rejected") {
    if (!this.notes || this.notes.length === 0) {
      throw new Error("Rejection requires at least one remark");
    }

    if (!this.reviewedBy) {
      throw new Error("Rejected indicators must have a reviewer");
    }

    if (!this.reviewedAt) {
      this.reviewedAt = new Date();
    }
  }
});

/* =====================================================
   VIRTUALS
===================================================== */

indicatorSchema.virtual("phase").get(function () {
  const now = new Date();
  const terminal = ["submitted", "approved", "completed", "rejected"];

  if (terminal.includes(this.status)) return this.status;
  if (this.status === "overdue" || now > this.dueDate) return "overdue";
  if (now < this.startDate) return "upcoming";
  return "ongoing";
});

/* =====================================================
   MODEL
===================================================== */

export const Indicator: Model<IIndicator> =
  mongoose.models.Indicator ||
  mongoose.model<IIndicator>("Indicator", indicatorSchema);
