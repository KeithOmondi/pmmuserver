import mongoose, { Schema, Model, HydratedDocument } from "mongoose";
import { generateOTP } from "../utils/generateOTP";

/* =========================
   TYPES
========================= */

export type Role = "SuperAdmin" | "Admin" | "User";

export interface IUser {
  name: string;
  email: string;
  pjNumber: string;
  role: Role;

  /* Account state */
  accountVerified: boolean;
  accountLocked: boolean;

  /* Security Tracking */
  // Incremented on logout to invalidate old tokens
  tokenVersion: number;

  /* Activity tracking */
  lastActivityAt?: Date;

  /* Login OTP (hashed) */
  loginOtp?: string;
  loginOtpExpiry?: Date;

  otpAttempts?: number;
  otpBlockedUntil?: Date;

  avatar?: {
    url?: string;
    publicId?: string;
  };
}

/* =========================
   METHODS TYPE
========================= */

export interface IUserMethods {
  generateLoginOtp(): string;
  clearLoginOtp(): void;
  isOtpExpired(): boolean;
}

/* =========================
   DOCUMENT TYPE
========================= */

export type UserDocument = HydratedDocument<IUser, IUserMethods>;

/* =========================
   SCHEMA
========================= */

const roles: Role[] = ["SuperAdmin", "Admin", "User"];

const userSchema = new Schema<
  IUser,
  Model<IUser, {}, IUserMethods>,
  IUserMethods
>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/, "Invalid email"],
    },

    pjNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    role: {
      type: String,
      enum: roles,
      default: "User",
    },

    accountVerified: {
      type: Boolean,
      default: false,
    },

    accountLocked: {
      type: Boolean,
      default: true,
    },

    // Initialize tokenVersion at 0
    tokenVersion: {
      type: Number,
      default: 0,
      required: true,
    },

    lastActivityAt: {
      type: Date,
    },

    loginOtp: {
      type: String,
      select: false,
    },

    loginOtpExpiry: {
      type: Date,
      select: false,
    },

    otpAttempts: {
      type: Number,
      default: 0,
    },

    otpBlockedUntil: {
      type: Date,
    },

    avatar: {
      url: String,
      publicId: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* =========================
   METHODS
========================= */

userSchema.methods.generateLoginOtp = function (): string {
  const { otp, hashedOtp, expiresAt } = generateOTP();
  this.loginOtp = hashedOtp;
  this.loginOtpExpiry = expiresAt;
  return otp;
};

userSchema.methods.clearLoginOtp = function (): void {
  this.loginOtp = undefined;
  this.loginOtpExpiry = undefined;
};

userSchema.methods.isOtpExpired = function (): boolean {
  if (!this.loginOtpExpiry) return true;
  return this.loginOtpExpiry.getTime() < Date.now();
};

/* =========================
   MODEL
========================= */

// Updated to use UserDocument for better type support during queries
export const User = mongoose.model<IUser, Model<IUser, {}, IUserMethods>>(
  "User",
  userSchema,
);
