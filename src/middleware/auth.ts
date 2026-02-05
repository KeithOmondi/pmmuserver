import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { User, UserDocument } from "../models/User";
import { env } from "../config/env";
import ErrorHandler from "./errorMiddlewares";
import { catchAsyncErrors } from "./catchAsyncErrors";

interface AccessTokenPayload extends JwtPayload {
  id: string;
  tokenVersion: number; // Added version tracking
}

export const isAuthenticated = catchAsyncErrors(
  async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) return next(new ErrorHandler(401, "Not authenticated"));

    let decoded: AccessTokenPayload;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET!) as AccessTokenPayload;
    } catch {
      return next(new ErrorHandler(401, "Invalid or expired access token"));
    }

    const user = await User.findById(decoded.id).select("-password");

    // Check if user exists AND if the token version matches the DB
    if (!user) return next(new ErrorHandler(401, "User no longer exists"));

    if (user.tokenVersion !== decoded.tokenVersion) {
      return next(new ErrorHandler(401, "Session expired, please login again"));
    }

    req.user = user;
    next();
  },
);

export const isAuthorized = (...roles: string[]) => {
  const allowedRoles = roles.map((r) => r.toLowerCase());
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role?.toLowerCase();
    if (!role || !allowedRoles.includes(role)) {
      return next(new ErrorHandler(403, "Resource access denied"));
    }
    next();
  };
};
