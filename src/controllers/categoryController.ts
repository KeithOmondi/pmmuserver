// controllers/categoryController.ts
import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import { Category, ICategory } from "../models/Category";
import { catchAsyncErrors } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../middleware/errorMiddlewares";

// Extend ICategory to include children for hierarchy
export interface ICategoryWithChildren extends ICategory {
  children?: ICategoryWithChildren[];
}

/* ============================================================
   📌 HELPER: Validate Depth Rules
      - Category A: max level 4
      - Categories B–E: max level 3
============================================================ */
const validateDepth = (parent: ICategory, next: NextFunction) => {
  if (!parent) return;

  const isA = parent.code.startsWith("A");

  if (isA && parent.level >= 4)
    return next(new ErrorHandler(400, "Category A cannot exceed level 4"));

  if (!isA && parent.level >= 3)
    return next(new ErrorHandler(400, "Categories B–E cannot exceed level 3"));
};

/* ============================================================
   📌 CREATE CATEGORY
============================================================ */
export const createCategory = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { code, title, parentId, parentCode } = req.body;

    // prevent duplicate code
    const existing = await Category.findOne({ code });
    if (existing)
      return next(
        new ErrorHandler(400, `Category with code ${code} already exists`)
      );

    let parent: ICategory | null = null;

    // parent resolved by parentId
    if (parentId) {
      if (!mongoose.Types.ObjectId.isValid(parentId))
        return next(new ErrorHandler(400, "Invalid parentId"));

      parent = await Category.findById(parentId);
      if (!parent)
        return next(new ErrorHandler(404, "Parent category not found"));

      validateDepth(parent, next);
    }

    // OR parent resolved by parentCode
    if (!parent && parentCode) {
      parent = await Category.findOne({ code: parentCode });
      if (!parent)
        return next(
          new ErrorHandler(
            404,
            "Parent category with given parentCode not found"
          )
        );

      validateDepth(parent, next);
    }

    const category = await Category.create({
      code,
      title,
      parent: parent ? parent._id : null,
      parentCode: parentCode || (parent ? parent.code : null),
    });

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  }
);

/* ============================================================
   📌 GET ALL CATEGORIES
============================================================ */
export const getAllCategories = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const categories: ICategory[] = await Category.find()
      .sort({ code: 1 })
      .lean<ICategory[]>();

    res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  }
);

/* ============================================================
   📌 GET CATEGORY BY ID OR CODE
============================================================ */
export const getCategoryById = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    let category: ICategory | null = null;

    if (mongoose.Types.ObjectId.isValid(id))
      category = await Category.findById(id);

    if (!category) category = await Category.findOne({ code: id });

    if (!category) return next(new ErrorHandler(404, "Category not found"));

    res.status(200).json({
      success: true,
      category,
    });
  }
);

/* ============================================================
   📌 GET CATEGORY HIERARCHY (Recursive)
============================================================ */
export const getCategoryHierarchy = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { code } = req.params;

    const category: ICategoryWithChildren | null = await Category.findOne({
      code,
    }).lean<ICategoryWithChildren>();
    if (!category) return next(new ErrorHandler(404, "Category not found"));

    // Recursive function to fetch children
    const fetchChildren = async (
      parent: ICategoryWithChildren,
      maxLevel: number
    ): Promise<ICategoryWithChildren[]> => {
      if (!parent || parent.level >= maxLevel) return [];

      const children: ICategoryWithChildren[] = await Category.find({
        parent: parent._id,
      })
        .sort({ code: 1 })
        .lean<ICategoryWithChildren[]>();

      for (const child of children) {
        child.children = await fetchChildren(child, maxLevel);
      }

      return children;
    };

    const maxLevel = category.code.startsWith("A") ? 4 : 3;
    const children: ICategoryWithChildren[] = await fetchChildren(
      category,
      maxLevel
    );

    res.status(200).json({
      success: true,
      category,
      children,
    });
  }
);

/* ============================================================
   📌 UPDATE CATEGORY
============================================================ */
export const updateCategory = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const updates: Partial<ICategory> & {
      parentId?: string;
      parentCode?: string;
    } = { ...req.body };

    let category = await Category.findById(id);
    if (!category) return next(new ErrorHandler(404, "Category not found"));

    let parent: ICategory | null = null;

    // parentId update
    if (updates.parentId) {
      if (!mongoose.Types.ObjectId.isValid(updates.parentId))
        return next(new ErrorHandler(400, "Invalid parentId"));

      if (updates.parentId === id)
        return next(
          new ErrorHandler(400, "A category cannot be its own parent")
        );

      parent = await Category.findById(updates.parentId);
      if (!parent)
        return next(new ErrorHandler(404, "Parent category not found"));

      validateDepth(parent, next);

      updates.parent = parent._id;
      updates.parentCode = parent.code;
      delete updates.parentId;
    }

    // parentCode update
    if (updates.parentCode) {
      parent = await Category.findOne({ code: updates.parentCode });
      if (!parent)
        return next(new ErrorHandler(404, "Parent category not found"));

      validateDepth(parent, next);

      updates.parent = parent._id;
      updates.parentCode = parent.code;
    }

    // Safely calculate level and ensure it’s within 1–4
    if (parent) {
      const newLevel = Math.min(parent.level + 1, 4);
      updates.level = newLevel as 1 | 2 | 3 | 4;
    }

    category = await Category.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category,
    });
  }
);

/* ============================================================
   📌 DELETE CATEGORY
============================================================ */
export const deleteCategory = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) return next(new ErrorHandler(404, "Category not found"));

    const hasChildren = await Category.exists({ parent: id });
    if (hasChildren)
      return next(
        new ErrorHandler(
          400,
          "Cannot delete category that still has subcategories"
        )
      );

    await Category.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  }
);
