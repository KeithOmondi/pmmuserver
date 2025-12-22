import {
  v2 as cloudinary,
  UploadApiResponse,
} from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload buffer to Cloudinary
export const uploadToCloudinary = async (
  fileBuffer: Buffer,
  folder: string,
  fileName: string
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: fileName, resource_type: "auto" },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
};
