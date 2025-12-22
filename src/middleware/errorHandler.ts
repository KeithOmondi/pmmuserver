import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";

export interface ApiError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const status = err.statusCode || 500;

  logger.error(err.message);

  res.status(status).json({
    success: false,
    status,
    message: err.message || "Internal server error"
  });
};
