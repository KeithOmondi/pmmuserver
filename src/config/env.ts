import { config } from "dotenv";
import { z } from "zod";
import type { StringValue } from "ms";

// Load .env
config();

// --------------------
// Zod Schema
// --------------------
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("8000"),

  // Database
  MONGO_URI: z.string().nonempty("MONGO_URI is required"),
  DATABASE_NAME: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().nonempty("JWT_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().nonempty("JWT_REFRESH_SECRET is required"),
  JWT_EXPIRES_IN: z.custom<StringValue>().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.custom<StringValue>().default("7d"),

  // Frontend
  FRONTEND_URL: z.string().url(),

  // Cookies / Debug
  COOKIE_EXPIRE: z.string().default("7"),
  DEBUG_AUTH: z.enum(["true", "false"]).default("false"),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().nonempty(),
  CLOUDINARY_API_KEY: z.string().nonempty(),
  CLOUDINARY_API_SECRET: z.string().nonempty(),

  // Cache
  REDIS_URL: z.string().nonempty(),

  // Email
  BREVO_API_KEY: z.string().nonempty(),
  MAIL_FROM_NAME: z.string().default("ORHC"),
  MAIL_FROM_EMAIL: z.string().email().default("onboarding@yourdomain.com"),
});

// --------------------
// Validate env
// --------------------
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

// --------------------
// Export normalized env
// --------------------
export const env = {
  NODE_ENV: parsed.data.NODE_ENV,
  PORT: Number(parsed.data.PORT),

  MONGO_URI: parsed.data.MONGO_URI,
  DATABASE_NAME: parsed.data.DATABASE_NAME,

  JWT_SECRET: parsed.data.JWT_SECRET,
  JWT_REFRESH_SECRET: parsed.data.JWT_REFRESH_SECRET,
  JWT_EXPIRE: parsed.data.JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRE: parsed.data.JWT_REFRESH_EXPIRES_IN,

  FRONTEND_URL: parsed.data.FRONTEND_URL,

  COOKIE_EXPIRE: parsed.data.COOKIE_EXPIRE,
  DEBUG_AUTH: parsed.data.DEBUG_AUTH,

  CLOUDINARY_CLOUD_NAME: parsed.data.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: parsed.data.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: parsed.data.CLOUDINARY_API_SECRET,

  REDIS_URL: parsed.data.REDIS_URL,

  BREVO_API_KEY: parsed.data.BREVO_API_KEY,
  MAIL_FROM_NAME: parsed.data.MAIL_FROM_NAME,
  MAIL_FROM_EMAIL: parsed.data.MAIL_FROM_EMAIL,
};
