import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export const tokenService = {
  generateAccessToken(payload: object) {
    const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN };
    return jwt.sign(payload, env.JWT_SECRET, options);
  },

  generateRefreshToken(payload: object) {
    const options: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN };
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
  },

  verifyAccess(token: string) {
    return jwt.verify(token, env.JWT_SECRET);
  },

  verifyRefresh(token: string) {
    return jwt.verify(token, env.JWT_REFRESH_SECRET);
  },
};
