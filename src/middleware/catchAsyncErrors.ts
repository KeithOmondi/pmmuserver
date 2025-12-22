// middleware/catchAsyncErrors.ts
import { Request, Response, NextFunction } from "express";

export const catchAsyncErrors =
  (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
  ) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
