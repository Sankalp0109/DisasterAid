import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Verify JWT token
export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      console.log('🔒 Auth - No token provided for:', req.path);
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");

    if (!user || !user.isActive) {
      console.log('🔒 Auth - User not found or inactive:', decoded.userId);
      return res.status(401).json({ success: false, message: "Invalid token or user inactive" });
    }

    req.user = user;
    req.userId = user._id;
    req.userRole = user.role;
    
    console.log('✅ Auth - Authenticated:', { 
      userId: user._id, 
      userRole: user.role, 
      path: req.path 
    });
    
    next();
  } catch (error) {
    console.log('❌ Auth Error:', error.message);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

// Check if user has required role
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.log('🔒 Authorization Check - User not found in req.user');
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    console.log('🔒 Authorization Check:', { 
      userRole: req.userRole, 
      requiredRoles: roles, 
      isAuthorized: roles.includes(req.userRole),
      method: req.method,
      path: req.path
    });

    if (!roles.includes(req.userRole)) {
      console.log('❌ Authorization Failed - Role not in required list:', req.userRole);
      return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    console.log('✅ Authorization Passed for role:', req.userRole);
    next();
  };
};

// Check specific permissions
export const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    if (!req.user.permissions || !req.user.permissions[permission]) {
      return res.status(403).json({ success: false, message: `Permission denied: ${permission}` });
    }

    next();
  };
};

// Generate JWT token
export const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
};
