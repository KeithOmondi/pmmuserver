import multer, { FileFilterCallback } from "multer";
import { Request } from "express";

// In-memory storage for Multer (uploads to Cloudinary or similar)
const storage = multer.memoryStorage();

// Allowed MIME types
const allowedMimes = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/bmp",
  "image/webp",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
];


// File filter
const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (png, jpeg, jpg, gif, bmp, webp) or PDFs are allowed"));
  }
};

// Maximum file size: 5MB
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
