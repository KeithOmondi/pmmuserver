import { Request, Response, NextFunction } from "express";

// ============================
// ErrorHandler Class
// ============================
class ErrorHandler extends Error {
  public statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================
// Error Middleware
// ============================
interface CustomError extends Error {
  statusCode?: number;
  code?: number; // Mongo duplicate key
  keyValue?: Record<string, any>; // Mongo duplicate key
  path?: string; // CastError
  errors?: Record<string, { message: string }>; // ValidationError
}


export const errorMiddleware = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = err.statusCode || 500;
  let message: string =
    typeof err.message === "string" ? err.message : "Internal Server Error";

  console.error("ERROR:", err);

  // MongoDB duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    message = `Duplicate ${field} entered. Please use a different value.`;
    statusCode = 400;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    message = "Invalid token. Please log in again.";
    statusCode = 401;
  }

  if (err.name === "TokenExpiredError") {
    message = "Your token has expired. Please log in again.";
    statusCode = 401;
  }

  // Invalid ObjectId
  if (err.name === "CastError") {
    message = `Invalid ID format: ${err.path}`;
    statusCode = 400;
  }

  // Mongoose Validation Errors
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((val) => val.message);
    message = `Validation Error: ${messages.join(". ")}`;
    statusCode = 400;
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
};

export default ErrorHandler;
