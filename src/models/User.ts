import mongoose, { Schema, Model, HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/* =========================
   TYPES
========================= */

export type Role = "SuperAdmin" | "Admin" | "User";

export interface IUser {
  name: string;
  email: string;
  pjNumber: string;
  password: string;
  role: Role;
  accountVerified: boolean;

  avatar?: {
    url?: string;
    publicId?: string;
  };

  resetPasswordToken?: string;
  resetPasswordExpiry?: Date;
}

/* =========================
   METHODS TYPE
========================= */

export interface IUserMethods {
  comparePassword(enteredPassword: string): Promise<boolean>;
  generateResetPasswordToken(): string;
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
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/,
        "Invalid email",
      ],
    },
    pjNumber: { type: String, required: true, unique: true, trim: true },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: { type: String, enum: roles, default: "User" },
    accountVerified: { type: Boolean, default: false },
    avatar: {
      url: { type: String },
      publicId: { type: String },
    },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpiry: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

/* =========================
   PASSWORD HASHING
========================= */

userSchema.pre<UserDocument>("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

/* =========================
   METHODS
========================= */

userSchema.methods.comparePassword = async function (
  enteredPassword: string
): Promise<boolean> {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.generateResetPasswordToken = function (): string {
  const resetToken = crypto.randomBytes(20).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.resetPasswordExpiry = new Date(Date.now() + 15 * 60 * 1000);

  return resetToken;
};

/* =========================
   MODEL
========================= */

export const User = mongoose.model<IUser, Model<IUser, {}, IUserMethods>>(
  "User",
  userSchema
);
