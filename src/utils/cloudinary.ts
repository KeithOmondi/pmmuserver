// utils/cloudinary.ts
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true, // Forces helper methods to use HTTPS
});

// utils/cloudinary.ts
export const uploadToCloudinary = async (
  fileBuffer: Buffer,
  folder: string,
  publicId: string
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "raw",     // 🔴 FIX
        type: "authenticated",
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
};


export { cloudinary };
