import { Router } from "express";
import { authController } from "../controllers/authController";
import { isAuthenticated } from "../middleware/auth";

const router = Router();

router.post("/login", authController.login);
router.post("/logout", isAuthenticated, authController.logout);
router.post("/refresh", authController.refreshToken);

export default router;
