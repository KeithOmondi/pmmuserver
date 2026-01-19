import { Router } from "express";
import {
  requestLoginOtp,
  verifyLoginOtp,
  logout,
  refreshToken,
  resendLoginOtp,
} from "../controllers/authController";
import { isAuthenticated } from "../middleware/auth";
import { inactivityMiddleware } from "../middleware/inactivityMiddleware";

const router = Router();

/* =====================================================
   AUTHENTICATION ROUTES
===================================================== */

// STEP 1: Request Login OTP
router.post("/login/request-otp", requestLoginOtp);

// STEP 2: Verify OTP & Login
router.post("/login/verify-otp", verifyLoginOtp);

// STEP 3: Resend OTP
router.post("/login/resend-otp", resendLoginOtp);


// Logout (manual)
router.post(
  "/logout",
  isAuthenticated,
  inactivityMiddleware, // updates lastActivityAt before logout
  logout
);

// Refresh Access Token
router.post("/refresh", refreshToken);

export default router;
