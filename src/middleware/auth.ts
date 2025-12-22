import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { User, UserDocument } from "../models/User";
import { catchAsyncErrors } from "./catchAsyncErrors";
import ErrorHandler from "./errorMiddlewares";
import { env } from "../config/env";

/* =========================
   Extend Express Request
========================= */
declare module "express-serve-static-core" {
  interface Request {
    user?: UserDocument;
  }
}

/* =========================
   JWT Payload Interface
========================= */
interface AccessTokenPayload extends JwtPayload {
  id: string;
}

/* =========================
   AUTHENTICATION MIDDLEWARE
========================= */
export const isAuthenticated = catchAsyncErrors(
  async (req: Request, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    // ✅ Access token comes ONLY from Authorization header
    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(
        new ErrorHandler(401, "No access token provided. Please log in.")
      );
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET!) as AccessTokenPayload;

      if (!decoded?.id) {
        return next(new ErrorHandler(401, "Invalid access token payload."));
      }

      // ⚠️ Do NOT use .lean() — we need a Mongoose document
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return next(new ErrorHandler(401, "User no longer exists."));
      }

      req.user = user;

      if (env.DEBUG_AUTH === "true") {
        console.log("🔐 Authenticated:", {
          id: user._id,
          role: user.role,
        });
      }

      next();
    } catch (err: any) {
      console.error("JWT verification error:", err.message);
      return next(new ErrorHandler(401, "Invalid or expired access token."));
    }
  }
);

/* =========================
   AUTHORIZATION MIDDLEWARE
========================= */
export const isAuthorized = (...roles: string[]) => {
  const allowedRoles = roles.map((role) => role.toLowerCase());

  return (req: Request, _res: Response, next: NextFunction) => {
    const userRole = req.user?.role?.toLowerCase();

    if (env.DEBUG_AUTH === "true") {
      console.log("🔎 Role check:", {
        userRole,
        allowedRoles,
      });
    }

    if (!userRole || !allowedRoles.includes(userRole)) {
      return next(
        new ErrorHandler(
          403,
          `Role '${
            req.user?.role ?? "Unknown"
          }' is not allowed to access this resource.`
        )
      );
    }

    next();
  };
};
