import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { User, UserDocument } from "../models/User";
import { env } from "../config/env";
import ErrorHandler from "./errorMiddlewares";
import { catchAsyncErrors } from "./catchAsyncErrors";

/* =========================
   Extend Express Request
========================= */
declare module "express-serve-static-core" {
  interface Request {
    user?: UserDocument;
  }
}

interface AccessTokenPayload extends JwtPayload {
  id: string;
}

export const isAuthenticated = catchAsyncErrors(
  async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : null;

    if (!token) {
      return next(new ErrorHandler(401, "Not authenticated"));
    }

    let decoded: AccessTokenPayload;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET!) as AccessTokenPayload;
    } catch {
      return next(new ErrorHandler(401, "Invalid or expired access token"));
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return next(new ErrorHandler(401, "User no longer exists"));
    }

    req.user = user;
    next();
  }
);

/* =========================
   AUTHORIZATION
========================= */
export const isAuthorized = (...roles: string[]) => {
  const allowedRoles = roles.map((r) => r.toLowerCase());

  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role?.toLowerCase();

    if (!role || !allowedRoles.includes(role)) {
      return next(
        new ErrorHandler(403, "You are not allowed to access this resource")
      );
    }

    next();
  };
};
