import { User } from "../models/User.js";
import { NGO } from "../models/NGO.js";
import { AuditLog } from "../models/AuditLog.js";
import { generateToken } from "../middleware/auth.js";
import { parsePhoneNumber } from "../utils/phoneParser.js";
import crypto from "crypto";
import { sendPasswordResetEmail, sendPasswordChangedEmail } from "../services/emailService.js";

// Register new user
export const register = async (req, res) => {
  try {
    const { name, email, password, phone, role, organizationName, language, ngoLocation } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password, and role are required",
      });
    }

    // Validate NGO-specific requirements
    if (role === "ngo") {
      if (!organizationName) {
        return res.status(400).json({
          success: false,
          message: "Organization name is required for NGO registration",
        });
      }
      if (!ngoLocation || !ngoLocation.lat || !ngoLocation.lng) {
        return res.status(400).json({
          success: false,
          message: "GPS location is required for NGO registration",
        });
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Block all privileged roles from self-registration (only victims can self-register)
    // NGO, Authority, Operator, and Admin accounts must be created by Platform Admin
    const restrictedRoles = ["ngo", "authority", "operator", "admin"];
    if (restrictedRoles.includes(role)) {
      return res.status(403).json({ 
        success: false, 
        message: `${role.toUpperCase()} accounts cannot self-register. These accounts must be created by the Platform Administrator. Contact your system administrator for account creation.` 
      });
    }

    // 📱 Phone handling: If frontend already sent countryCode and phone separately, use them directly
    // Otherwise, parse the phone to extract country code
    let parsedCountryCode = req.body.countryCode || '+91';
    let parsedPhone = phone;
    
    // ONLY parse if countryCode was NOT provided (backward compatibility)
    if (phone && !req.body.countryCode) {
      const parsed = parsePhoneNumber(phone);
      parsedCountryCode = parsed.countryCode;
      parsedPhone = parsed.phoneNumber;
      console.log(`📞 User Phone Parsing (from combined):
        Input: ${phone}
        Country Code: ${parsedCountryCode}
        Phone Number: ${parsedPhone}`);
    } else if (phone && req.body.countryCode) {
      // Frontend already sent separate countryCode and phone
      // Just clean the phone to digits only
      parsedPhone = String(phone).replace(/\D/g, '');
      console.log(`📞 User Phone (already separated):
        Country Code: ${parsedCountryCode}
        Phone Number: ${parsedPhone}`);
    }

    // Create user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      countryCode: parsedCountryCode,
      phone: parsedPhone,
      role,
      organizationName,
      language: language || "en",
      isVerified: role === "victim", // Auto-verify victims
    });

    // Set default permissions based on role
    if (role === "authority") {
      user.permissions = {
        canTriage: true,
        canAssign: true,
        canVerify: true,
        canManageShelters: true,
        canViewAnalytics: true,
        canExportData: true,
      };
    } else if (role === "admin") {
      user.permissions = {
        canTriage: true,
        canAssign: true,
        canVerify: true,
        canManageShelters: true,
        canViewAnalytics: true,
        canExportData: true,
      };
    }

    await user.save();

    // If NGO, create NGO record with location
    if (role === "ngo" && organizationName) {
      const ngo = new NGO({
        name: organizationName,
        email: email.toLowerCase(),
        countryCode: parsedCountryCode,
        phone: parsedPhone,
        adminUser: user._id,
        location: {
          type: "Point",
          coordinates: [ngoLocation.lng, ngoLocation.lat], // [longitude, latitude] for GeoJSON
          address: ngoLocation.address || `${ngoLocation.lat}, ${ngoLocation.lng}`
        },
        // Note: Capabilities are now derived from Offers that the NGO creates
        isActive: true,
        isVerified: false, // Requires authority verification
        isOnline: true,
        maxActiveRequests: 50,
        activeRequests: 0,
        maxActiveAssignments: 50,
        activeAssignments: 0,
        coverageRadius: 50000, // Default 50km coverage
      });
      await ngo.save();
      user.organizationId = ngo._id;
      await user.save();
    }

    // Generate token
    const token = generateToken(user._id);

    // Audit log
    await AuditLog.log({
      action: "user_register",
      performedBy: user._id,
      performedByRole: user.role,
      performedByName: user.name,
      performedByEmail: user.email,
      targetType: "User",
      targetId: user._id,
      details: { role: user.role },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        organizationId: user.organizationId,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
};

// Login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if account is locked
    if (user.isLocked()) {
      return res.status(423).json({
        success: false,
        message: "Account is temporarily locked. Please try again later.",
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive. Please contact support.",
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Increment login attempts
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000; // Lock for 15 minutes
      }
      await user.save();

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Reset login attempts on successful login
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastActive = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Audit log
    await AuditLog.log({
      action: "user_login",
      performedBy: user._id,
      performedByRole: user.role,
      performedByName: user.name,
      performedByEmail: user.email,
      targetType: "User",
      targetId: user._id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        organizationId: user.organizationId,
        permissions: user.permissions,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

// Logout
export const logout = async (req, res) => {
  try {
    // Audit log
    await AuditLog.log({
      action: "user_logout",
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: "User",
      targetId: req.userId,
      ipAddress: req.ip,
    });

    res.clearCookie("token");
    res.json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Logout failed",
      error: error.message,
    });
  }
};

// Get current user
export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("-password")
      .populate("organizationId", "name email isVerified");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        isVerified: user.isVerified,
        organizationId: user.organizationId,
        permissions: user.permissions,
        language: user.language,
        isOnline: user.isOnline,
        lastActive: user.lastActive,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get user",
      error: error.message,
    });
  }
};

// Update profile
export const updateProfile = async (req, res) => {
  try {
    const { name, phone, countryCode, language, preferredCommunication, location } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update fields
    if (name) user.name = name;
    if (phone) {
      // ONLY parse if countryCode is NOT provided
      if (countryCode) {
        // Frontend already sent separate countryCode and phone
        user.countryCode = countryCode;
        user.phone = String(phone).replace(/\D/g, '');
        console.log(`📞 User Phone Update (already separated):
          Country Code: ${countryCode}
          Phone Number: ${user.phone}`);
      } else {
        // No country code provided - need to parse
        const parsed = parsePhoneNumber(phone);
        user.countryCode = parsed.countryCode;
        user.phone = parsed.phoneNumber;
        console.log(`📞 User Phone Update (parsed):
          Input: ${phone}
          Country Code: ${parsed.countryCode}
          Phone Number: ${parsed.phoneNumber}`);
      }
    }
    if (language) user.language = language;
    if (preferredCommunication) user.preferredCommunication = preferredCommunication;
    if (location) user.location = location;

    await user.save();

    // Audit log
    await AuditLog.log({
      action: "user_update",
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: "User",
      targetId: user._id,
      details: { updatedFields: Object.keys(req.body) },
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        countryCode: user.countryCode,
        phone: user.phone,
        role: user.role,
        language: user.language,
        preferredCommunication: user.preferredCommunication,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

// Forgot password - send reset email
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if user exists
      return res.json({
        success: true,
        message: "If an account exists with this email, a password reset link has been sent.",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send reset email
    try {
      await sendPasswordResetEmail(user.email, user.name, resetToken, user._id);
      
      // Audit log
      await AuditLog.log({
        action: "password_reset_requested",
        performedBy: user._id,
        performedByRole: user.role,
        performedByName: user.name,
        performedByEmail: user.email,
        targetType: "User",
        targetId: user._id,
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        message: "Password reset link has been sent to your email.",
      });
    } catch (emailError) {
      console.error("Failed to send reset email:", emailError);
      res.status(500).json({
        success: false,
        message: "Failed to send reset email. Please try again later.",
      });
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process request",
      error: error.message,
    });
  }
};

// Reset password with token
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Hash the token to match stored hash
    const resetTokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    // Update password
    user.password = newPassword; // Will be hashed by pre-save hook
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Send confirmation email
    try {
      await sendPasswordChangedEmail(user.email, user.name, user._id);
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
      // Continue even if email fails
    }

    // Audit log
    await AuditLog.log({
      action: "password_reset_completed",
      performedBy: user._id,
      performedByRole: user.role,
      performedByName: user.name,
      performedByEmail: user.email,
      targetType: "User",
      targetId: user._id,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: "Password has been reset successfully. You can now login with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset password",
      error: error.message,
    });
  }
};

// Change password (for logged in users)
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify current password
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Update password
    user.password = newPassword; // Will be hashed by pre-save hook
    await user.save();

    // Send confirmation email
    try {
      await sendPasswordChangedEmail(user.email, user.name, user._id);
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
      // Continue even if email fails
    }

    // Audit log
    await AuditLog.log({
      action: "password_changed",
      performedBy: user._id,
      performedByRole: user.role,
      performedByName: user.name,
      performedByEmail: user.email,
      targetType: "User",
      targetId: user._id,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: error.message,
    });
  }
};
