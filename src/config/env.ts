import { config } from "dotenv";
import { z } from "zod";

config();

/* =========================
   ENV SCHEMA
========================= */

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("5000"),

  /* =========================
     DATABASE
  ========================= */
  MONGO_URI: z.string().nonempty("MONGO_URI is required"),
  DATABASE_NAME: z.string().optional(),

  /* =========================
     JWT CONFIG
  ========================= */
  JWT_SECRET: z.string().nonempty("JWT_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().nonempty("JWT_REFRESH_SECRET is required"),

  // Access token lifetime
  JWT_EXPIRES_IN: z
    .enum(["5m", "15m", "30m", "1h", "1d"])
    .default("15m"),

  // Refresh token lifetime
  JWT_REFRESH_EXPIRES_IN: z
    .enum(["1d", "7d", "30d"])
    .default("7d"),

  /* =========================
     CLIENT
  ========================= */
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL"),

  /* =========================
     COOKIES
  ========================= */
  COOKIE_EXPIRE: z.string().default("7"), // days (legacy / fallback)
  DEBUG_AUTH: z.enum(["true", "false"]).default("false"),

  /* =========================
     CLOUDINARY
  ========================= */
  CLOUDINARY_CLOUD_NAME: z.string().nonempty(),
  CLOUDINARY_API_KEY: z.string().nonempty(),
  CLOUDINARY_API_SECRET: z.string().nonempty(),
});

/* =========================
   VALIDATION
========================= */

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

/* =========================
   EXPORT
========================= */

export const env = {
  ...parsed.data,
  PORT: Number(parsed.data.PORT),
};
