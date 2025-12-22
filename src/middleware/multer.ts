import multer, { FileFilterCallback } from "multer";
import { Request } from "express";

// In-memory storage for Multer (we will upload to Cloudinary directly)
const storage = multer.memoryStorage();

// File filter: only images / pdfs for example
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype === "application/pdf"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only images or PDFs are allowed"));
  }
};

// Maximum file size: 5MB
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
