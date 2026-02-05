import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

/* =====================================================
   UPLOAD (NO CHANGE – THIS IS ALREADY CORRECT)
===================================================== */

export const uploadToCloudinary = async (
  fileBuffer: Buffer,
  folder: string,
  publicId: string,
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: `${Date.now()}-${publicId}`,
        resource_type: "auto",
        type: "authenticated",
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve(result);
      },
    );

    stream.end(fileBuffer);
  });
};

/* =====================================================
   SIGNED PREVIEW URL (FIXED)
===================================================== */

export const getSignedPreviewUrl = (
  publicId: string,
  resourceType: "raw" | "image" | "video" = "raw",
  expiresInSeconds = 300,
) => {
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  });
};

export { cloudinary };
