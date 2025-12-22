import { Schema, model, Types } from "mongoose";

export interface INotification {
  user: Types.ObjectId; // recipient
  submittedBy?: Types.ObjectId; // optional
  title: string;
  message: string;
  type: "system" | "assignment" | "approval" | "rejection";
  metadata?: Record<string, any>;
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["system", "assignment", "approval", "rejection"],
      default: "system",
    },
    metadata: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Notification = model<INotification>("Notification", notificationSchema);
