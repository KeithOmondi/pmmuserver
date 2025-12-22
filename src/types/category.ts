import { Request } from "express";
import { Types } from "mongoose";

/* ---------------------------------------------------
 * Category Tree Node (Returned to Frontend)
 * --------------------------------------------------- */
export interface CategoryNode {
  _id: string;
  code: string;
  title: string;
  description?: string;
  level: number;
  isActive: boolean;
  slug: string;
  order: number;
  parent?: string | null;
  children: CategoryNode[];
}

/* ---------------------------------------------------
 * Pagination Helpers
 * --------------------------------------------------- */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/* ---------------------------------------------------
 * Filters For Category Listing
 * --------------------------------------------------- */
export interface CategoryFilters {
  level?: number;
  isActive?: boolean;
  parent?: string | null;
  search?: string;
}

/* ---------------------------------------------------
 * API Response Wrapper
 * --------------------------------------------------- */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/* ---------------------------------------------------
 * Create Category DTO (Used in Controller)
 * --------------------------------------------------- */
export interface CreateCategoryDTO {
  code: string;
  title: string;
  description?: string;

  /** parent _id from frontend */
  parent?: Types.ObjectId | string | null;

  /** optional: backend computes defaults */
  order?: number;
  isActive?: boolean;
}

/* ---------------------------------------------------
 * Update Category DTO
 * --------------------------------------------------- */
export interface UpdateCategoryDTO {
  code?: string;
  title?: string;
  description?: string;
  parent?: string | null;    // ✔ must exist since update controller uses it
  order?: number;
  isActive?: boolean;
}

/* ---------------------------------------------------
 * Extend Express Request Typings
 * --------------------------------------------------- */
declare global {
  namespace Express {
    interface Request {
      pagination?: PaginationParams;
      filters?: CategoryFilters;
    }
  }
}
