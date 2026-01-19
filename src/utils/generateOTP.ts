import crypto from "crypto";

/* =========================
   TYPES
========================= */

export interface GeneratedOTP {
  otp: string;
  hashedOtp: string;
  expiresAt: Date;
}

/* =========================
   CONFIG
========================= */

const DEFAULT_OTP_LENGTH = 6;
const DEFAULT_EXPIRY_MINUTES = 5;

/* =========================
   HELPERS
========================= */

const generateNumericOtp = (length: number): string => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(min + Math.random() * (max - min)).toString();
};

const hashOtp = (otp: string): string =>
  crypto.createHash("sha256").update(otp).digest("hex");

/* =========================
   MAIN FUNCTION
========================= */

export const generateOTP = (
  length: number = DEFAULT_OTP_LENGTH,
  expiryMinutes: number = DEFAULT_EXPIRY_MINUTES
): GeneratedOTP => {
  const otp = generateNumericOtp(length);

  return {
    otp,
    hashedOtp: hashOtp(otp),
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
  };
};
