// models/categoryModel.ts
import mongoose, { Document, Schema, Model } from "mongoose";

// TypeScript interface for Category
export interface ICategory extends Document {
  code: string;
  title: string;
  parent?: mongoose.Types.ObjectId | null;
  parentCode?: string | null;
  level: 1 | 2 | 3 | 4;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema: Schema<ICategory> = new mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      required: true,
      unique: true, // ✅ unique constraint, automatically creates an index
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    parentCode: {
      type: String,
      trim: true,
      default: null,
    },

    level: {
      type: Number,
      enum: [1, 2, 3, 4],
      default: 1,
    },
  },
  { timestamps: true }
);

// Indexes
// Keep only the non-duplicate index
categorySchema.index({ parent: 1 });

// Model
export const Category: Model<ICategory> = mongoose.model<ICategory>(
  "Category",
  categorySchema
);
