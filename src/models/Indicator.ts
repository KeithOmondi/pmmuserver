import mongoose, { Schema, Model, Types, HydratedDocument } from "mongoose";

/* =====================================================
   EVIDENCE
===================================================== */
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
    description: { type: String },
  },
  { _id: false }
);

/* =====================================================
   NOTES
===================================================== */
export interface INote {
  text: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const noteSchema = new Schema<INote>(
  {
    text: { type: String, required: true, trim: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/* =====================================================
   WORKFLOW STATUS
===================================================== */
export type IndicatorStatus =
  | "pending" // Assigned, not yet submitted
  | "submitted" // Evidence submitted by user
  | "approved" // Approved by admin
  | "completed" // Real-world verification done
  | "rejected" // Explicit rejection
  | "overdue"; // System-driven (cron)

/* =====================================================
   INDICATOR INTERFACE
===================================================== */
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

  // Only meaningful once COMPLETED
  result?: "pass" | "fail" | null;

  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;

  reportData?: Record<string, unknown>;
  calendarEvent?: Record<string, unknown> | null;

  createdAt: Date;
  updatedAt: Date;
}

/* =====================================================
   INDICATOR SCHEMA
===================================================== */
const indicatorSchema = new Schema<IIndicator>(
  {
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },

    level2Category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
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
      index: true,
    },

    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required() {
        return this.assignedToType === "individual";
      },
      index: true,
    },

    assignedGroup: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
      index: true,
    },

    dueDate: {
      type: Date,
      required: true,
      index: true,
    },

    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    notes: {
      type: [noteSchema],
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
      index: true,
    },

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
      index: true,
    },

    result: {
      type: String,
      enum: ["pass", "fail"],
      default: null,
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
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* =====================================================
   VALIDATION RULES
===================================================== */
indicatorSchema.pre("validate", function (this: HydratedDocument<IIndicator>) {
  if (
    this.assignedToType === "group" &&
    (!this.assignedGroup || this.assignedGroup.length === 0)
  ) {
    this.invalidate(
      "assignedGroup",
      "assignedGroup is required when assignedToType is 'group'"
    );
  }
});

/* =====================================================
   VIRTUAL: SCHEDULING PHASE (UI ONLY)
===================================================== */
/**
 * phase is NOT persisted.
 * It exists purely for dashboards.
 */
indicatorSchema.virtual("phase").get(function () {
  const now = new Date();

  if (this.status === "submitted") return "submitted";
  if (this.status === "approved") return "approved";
  if (this.status === "rejected") return "rejected";
  if (this.status === "completed") return "completed";
  if (this.status === "overdue") return "overdue";

  if (now < this.startDate) return "upcoming";
  if (now >= this.startDate && now <= this.dueDate) return "ongoing";

  return "pending";
});

/* =====================================================
   MODEL
===================================================== */
export const Indicator: Model<IIndicator> =
  mongoose.models.Indicator ||
  mongoose.model<IIndicator>("Indicator", indicatorSchema);
