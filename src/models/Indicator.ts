// models/indicatorModel.ts
import mongoose, { Schema, Model, Types } from "mongoose";

/* =====================================
   EVIDENCE
===================================== */
export interface IEvidence {
  type: "file";
  fileUrl: string;
  fileName: string;
  publicId: string;
  fileType: string;
  fileSize: number;
  description?: string;
}


const evidenceSchema = new Schema<IEvidence>(
  {
    type: { type: String, enum: ["file"], required: true },
    fileUrl: { type: String, required: true },
    fileName: { type: String, required: true },
    publicId: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
  },
  { _id: false }
);

/* =====================================
   INDICATOR INTERFACE
===================================== */
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

  notes: unknown[];              // ✅ flexible but typed
  evidence: IEvidence[];

  createdBy: Types.ObjectId;

  status: "pending" | "approved" | "rejected" | "overdue";

  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;

  reportData?: Record<string, unknown>;
  calendarEvent?: Record<string, unknown> | null;

  createdAt: Date;
  updatedAt: Date;
}

/* =====================================
   INDICATOR SCHEMA
===================================== */
const indicatorSchema = new Schema<IIndicator>(
  {
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    level2Category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    indicatorTitle: {
      type: String,
      required: true,
      trim: true,
    },

    unitOfMeasure: {
      type: String,
      required: true,
    },

    assignedToType: {
      type: String,
      enum: ["individual", "group"],
      required: true,
    },

    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.assignedToType === "individual";
      },
    },

    assignedGroup: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },

    startDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },

    progress: { type: Number, default: 0 },

    /* ✅ FIXED PROPERLY */
    notes: {
      type: [Schema.Types.Mixed], // <-- THIS was the real issue
      default: [],
    },

    evidence: {
      type: [evidenceSchema],
      default: [],
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "overdue"],
      default: "pending",
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reportData: {
      type: Schema.Types.Mixed,
      default: {},
    },

    calendarEvent: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

/* =====================================
   MODEL
===================================== */
export const Indicator: Model<IIndicator> =
  mongoose.models.Indicator ||
  mongoose.model<IIndicator>("Indicator", indicatorSchema);
