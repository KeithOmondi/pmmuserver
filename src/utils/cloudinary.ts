import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

// -------------------------------------
// Cloudinary Configuration
// -------------------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

// -------------------------------------
// Upload buffer to Cloudinary
// -------------------------------------
export const uploadToCloudinary = async (
  fileBuffer: Buffer,
  folder: string,
  originalFileName: string
): Promise<UploadApiResponse> => {
  // 🔥 Remove extension from file name (CRITICAL)
  const cleanName = originalFileName.replace(/\.[^/.]+$/, "");

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: cleanName,
        resource_type: "auto", // images, pdfs, etc
      },
      (error, result) => {
        if (error || !result) {
          return reject(error);
        }
        resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
};

// -------------------------------------
// Export Cloudinary instance
// -------------------------------------
export { cloudinary };
