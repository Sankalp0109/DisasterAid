import { User } from "../models/User.js";
import { NGO } from "../models/NGO.js";
import { AuditLog } from "../models/AuditLog.js";
import { parsePhoneNumber } from "../utils/phoneParser.js";
import { sendUserCredentials } from "../services/emailService.js";

/**
 * Create a new user (Admin only)
 * This allows admins to create NGO, Authority, Operator, or even other Admin accounts
 */
export const createUser = async (req, res) => {
  try {
    const { name, email, password, phone, countryCode, role, organizationName, permissions, ngoLocation } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password, and role are required",
      });
    }

    // Validate role
    const validRoles = ["ngo", "authority", "operator", "admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Admin can create: ngo, authority, operator, admin",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Validate NGO-specific requirements
    if (role === "ngo") {
      if (!organizationName) {
        return res.status(400).json({
          success: false,
          message: "Organization name is required for NGO accounts",
        });
      }
      // Location is now captured when NGO creates their first offer
      // No longer required during account creation
    }

    // Parse phone if provided
    let parsedCountryCode = countryCode || '+91';
    let parsedPhone = phone || '';
    
    if (phone && !countryCode) {
      const parsed = parsePhoneNumber(phone);
      parsedCountryCode = parsed.countryCode;
      parsedPhone = parsed.phoneNumber;
    } else if (phone && countryCode) {
      parsedPhone = String(phone).replace(/\D/g, '');
    }

    // Set default permissions based on role (can be overridden by permissions param)
    let defaultPermissions = {};
    if (role === "authority") {
      defaultPermissions = {
        canTriage: true,
        canAssign: true,
        canVerify: true,
        canManageShelters: true,
        canViewAnalytics: true,
        canExportData: true,
      };
    } else if (role === "operator") {
      defaultPermissions = {
        canTriage: true,
        canResolveDuplicates: true,
        canConfirmMatches: true,
        canHandleEscalations: true,
        canViewAnalytics: true,
      };
    } else if (role === "admin") {
      defaultPermissions = {
        canTriage: true,
        canAssign: true,
        canVerify: true,
        canManageShelters: true,
        canViewAnalytics: true,
        canExportData: true,
        canManageRoles: true,
        canManageDataRetention: true,
        canExportIncidents: true,
      };
    }

    // Merge with custom permissions if provided
    const finalPermissions = { ...defaultPermissions, ...(permissions || {}) };

    // Create user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password, // Will be hashed by pre-save hook
      countryCode: parsedCountryCode,
      phone: parsedPhone,
      role,
      organizationName,
      permissions: finalPermissions,
      isVerified: true, // Admin-created users are pre-verified
      isActive: true,
    });

    await user.save();

    // If NGO, create NGO record
    if (role === "ngo" && organizationName) {
      const ngoData = {
        name: organizationName,
        email: email.toLowerCase(),
        countryCode: parsedCountryCode,
        phone: parsedPhone,
        adminUser: user._id,
        userId: user._id,
        isActive: true,
        isVerified: true, // Admin-created NGOs are pre-verified
        isOnline: true,
        maxActiveRequests: 50,
        activeRequests: 0,
        maxActiveAssignments: 50,
        activeAssignments: 0,
        coverageRadius: 50000,
      };

      // Add location only if provided (optional now)
      if (ngoLocation && ngoLocation.lat && ngoLocation.lng) {
        ngoData.location = {
          type: "Point",
          coordinates: [ngoLocation.lng, ngoLocation.lat],
          address: ngoLocation.address || `${ngoLocation.lat}, ${ngoLocation.lng}`
        };
      }
      // Otherwise location will be set when NGO creates their first offer

      const ngo = new NGO(ngoData);
      await ngo.save();
      user.organizationId = ngo._id;
      await user.save();
    }

    // Send credentials email to the new user
    try {
      const adminUser = await User.findById(req.userId);
      await sendUserCredentials(
        user.email,
        user.name,
        user.role,
        password,
        adminUser?.name || 'Platform Administrator',
        user._id  // Pass userId for logging
      );
      console.log(`✉️  Credentials email sent to ${user.email}`);
    } catch (emailError) {
      console.error('❌ Failed to send credentials email:', emailError.message);
      // Continue even if email fails - admin can still provide credentials manually
    }

    // Audit log
    await AuditLog.log({
      action: "admin_create_user",
      performedBy: req.userId,
      performedByRole: req.userRole,
      performedByName: req.userName,
      performedByEmail: req.userEmail,
      targetType: "User",
      targetId: user._id,
      details: { role: user.role, createdBy: "admin" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({
      success: true,
      message: `${role.toUpperCase()} user created successfully. Credentials have been sent to ${user.email}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        permissions: user.permissions,
        organizationId: user.organizationId,
      },
      credentials: {
        email: user.email,
        // Note: In production, send password via secure channel (email, SMS)
        // For now, return it so admin can provide it to the user
        temporaryPassword: password,
      }
    });
  } catch (error) {
    console.error("Admin create user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: error.message,
    });
  }
};

/**
 * Export audit logs (CSV or JSON)
 */
export const exportAuditLogs = async (req, res) => {
  try {
    const { startDate, endDate, action, targetType, format = 'json', limit = 1000 } = req.query;

    const query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    if (action) query.action = Array.isArray(action) ? { $in: action } : action;
    if (targetType) query.targetType = targetType;

    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit) || 1000, 5000))
      .lean();

    if (format === 'csv') {
      // Convert to CSV
      const headers = [
        'Timestamp',
        'Action',
        'PerformedByName',
        'PerformedByEmail',
        'PerformedByRole',
        'TargetType',
        'TargetId',
        'Status',
        'Severity',
        'ErrorMessage',
        'Details'
      ];

      const rows = logs.map((l) => [
        new Date(l.timestamp).toISOString(),
        l.action,
        l.performedByName || '',
        l.performedByEmail || '',
        l.performedByRole || '',
        l.targetType || '',
        l.targetId ? l.targetId.toString() : '',
        l.status || '',
        l.severity || '',
        l.errorMessage || '',
        JSON.stringify(l.details || {}),
      ]);

      const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

      // Expose headers for CORS
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      return res.send(csv);
    }

    return res.json({ success: true, total: logs.length, data: logs });
  } catch (err) {
    console.error('Export audit logs error:', err);
    return res.status(500).json({ success: false, message: 'Failed to export audit logs', error: err.message });
  }
};

/**
 * Verify NGO or Authority
 */
export const verifyUser = async (req, res) => {
  try {
    const { userId, status, rejectionReason } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Only verify NGO and Authority users
    if (!["ngo", "authority"].includes(user.role)) {
      return res.status(400).json({ success: false, message: "Only NGOs and Authorities can be verified" });
    }

    const previousStatus = user.isVerified;

    // Update verification status
    user.isVerified = status === true || status === "true";
    
    if (user.role === "ngo" && user.organizationId) {
      const ngo = await NGO.findById(user.organizationId);
      if (ngo) {
        ngo.isVerified = user.isVerified;
        await ngo.save();
      }
    }

    await user.save();

    // Audit log
    await AuditLog.log({
      action: user.isVerified ? "user_verified" : "user_unverified",
      performedBy: req.userId,
      performedByRole: req.userRole,
      performedByName: req.userName,
      targetType: "User",
      targetId: user._id,
      details: {
        role: user.role,
        previousStatus,
        newStatus: user.isVerified,
        rejectionReason: rejectionReason || null,
      },
    });

    res.json({
      success: true,
      message: `User ${user.isVerified ? "verified" : "unverified"} successfully`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Verification failed", error: err.message });
  }
};

/**
 * Get pending verification list
 */
export const getPendingVerifications = async (req, res) => {
  try {
    const { role, limit = 50, skip = 0 } = req.query;

    const filter = { isVerified: false, $or: [{ role: "ngo" }, { role: "authority" }] };
    if (role) {
      filter.$or = [{ role }];
    }

    const pending = await User.find(filter)
      .select("name email phone role organizationName isActive createdAt")
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      total,
      data: pending,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch pending verifications", error: err.message });
  }
};

/**
 * Get verified users list
 */
export const getVerifiedUsers = async (req, res) => {
  try {
    const { role, limit = 50, skip = 0 } = req.query;

    const filter = { isVerified: true, $or: [{ role: "ngo" }, { role: "authority" }] };
    if (role) {
      filter.$or = [{ role }];
    }

    const verified = await User.find(filter)
      .select("name email phone role organizationName isActive createdAt")
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      total,
      data: verified,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch verified users", error: err.message });
  }
};

/**
 * Manage user roles and permissions
 */
export const manageUserRole = async (req, res) => {
  try {
    const { userId, newRole, permissions } = req.body;

    if (!userId || !newRole) {
      return res.status(400).json({ success: false, message: "User ID and new role required" });
    }

    const validRoles = ["victim", "ngo", "authority", "admin"];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const previousRole = user.role;
    user.role = newRole;

    // Update permissions if provided
    if (permissions && typeof permissions === "object") {
      Object.keys(permissions).forEach((perm) => {
        if (user.permissions.hasOwnProperty(perm)) {
          user.permissions[perm] = permissions[perm];
        }
      });
    }

    await user.save();

    // Audit log
    await AuditLog.log({
      action: "user_role_changed",
      performedBy: req.userId,
      performedByRole: req.userRole,
      performedByName: req.userName,
      targetType: "User",
      targetId: user._id,
      details: {
        previousRole,
        newRole,
        permissionsUpdated: permissions || null,
      },
    });

    res.json({
      success: true,
      message: "User role updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update user role", error: err.message });
  }
};

/**
 * Update user permissions
 */
export const updateUserPermissions = async (req, res) => {
  try {
    const { userId, permissions } = req.body;

    if (!userId || !permissions) {
      return res.status(400).json({ success: false, message: "User ID and permissions required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const previousPermissions = { ...user.permissions };

    // Update permissions
    Object.keys(permissions).forEach((perm) => {
      if (user.permissions.hasOwnProperty(perm)) {
        user.permissions[perm] = permissions[perm];
      }
    });

    await user.save();

    // Audit log
    await AuditLog.log({
      action: "user_permissions_updated",
      performedBy: req.userId,
      performedByRole: req.userRole,
      performedByName: req.userName,
      targetType: "User",
      targetId: user._id,
      details: {
        previousPermissions,
        newPermissions: user.permissions,
      },
    });

    res.json({
      success: true,
      message: "Permissions updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        permissions: user.permissions,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update permissions", error: err.message });
  }
};

/**
 * Get all users (admin view)
 */
export const getAllUsers = async (req, res) => {
  try {
    const { role, isActive, isVerified, limit = 100, skip = 0 } = req.query;

    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (isVerified !== undefined) filter.isVerified = isVerified === "true";

    const users = await User.find(filter)
      .select("name email phone role isActive isVerified organizationName createdAt")
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      total,
      data: users,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch users", error: err.message });
  }
};
