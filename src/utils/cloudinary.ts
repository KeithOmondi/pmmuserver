import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

/* =====================================================
   UPLOAD HELPER (FINAL)
===================================================== */
export const uploadToCloudinary = async (
  fileBuffer: Buffer,
  indicatorId: string,
  originalFileName: string
): Promise<UploadApiResponse> => {
  const timestamp = Date.now();

  // Strip extension + normalize filename
  const cleanFileName = originalFileName
    .replace(/\s+/g, "_")
    .replace(/\.[^/.]+$/, "");

  const publicId = `${timestamp}-${cleanFileName}`;
  const folder = `indicators/evidence/${indicatorId}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "auto",
        type: "authenticated",
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) return reject(error);

        /**
         * result.public_id will be:
         * indicators/evidence/{indicatorId}/{timestamp-name}
         */
        resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
};


type CachedResource = {
  data: any;
  expiresAt: number;
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cloudinaryCache = new Map<string, CachedResource>();

export const getCachedResource = async (
  cacheKey: string,
  fetcher: () => Promise<any>
) => {
  const now = Date.now();
  const cached = cloudinaryCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const data = await fetcher();

  cloudinaryCache.set(cacheKey, {
    data,
    expiresAt: now + CACHE_TTL,
  });

  return data;
};



export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: "image" | "raw" | "video" | "auto" = "auto" // Added "auto" here
) => {
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    invalidate: true,
  });
};


export { cloudinary };