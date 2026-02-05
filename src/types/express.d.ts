import { UserDocument } from "../models/User"; // Import the hydrated document type

declare global {
  namespace Express {
    interface Request {
      // Use the Document type here so .save() and .tokenVersion are recognized
      user?: UserDocument; 
      files?: Express.Multer.File[];
    }
  }
}