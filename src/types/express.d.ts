import { Types } from "mongoose";
import { IUser } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      user?: Partial<IUser> & { _id: Types.ObjectId; role: "SuperAdmin" | "Admin" | "User" | string };
      files?: Express.Multer.File[];
    }
  }
}
