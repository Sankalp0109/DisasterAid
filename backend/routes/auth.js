import express from "express";
import { 
  register, 
  login, 
  logout, 
  getCurrentUser, 
  updateProfile,
  forgotPassword,
  resetPassword,
  changePassword
} from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Protected routes
router.post("/logout", authenticate, logout);
router.get("/me", authenticate, getCurrentUser);
router.put("/profile", authenticate, updateProfile);
router.post("/change-password", authenticate, changePassword);

export default router;
