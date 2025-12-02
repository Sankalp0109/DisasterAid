import express from "express";
import { authenticate } from "../middleware/auth.js";
import {
  createUser,
  verifyUser,
  getPendingVerifications,
  getVerifiedUsers,
  manageUserRole,
  updateUserPermissions,
  getAllUsers,
} from "../controllers/adminController.js";
import {
  getDataRetentionPolicy,
  updateDataRetentionPolicy,
  exportIncidentsData,
  exportAssignmentsData,
  exportNGOMetricsData,
  executeDataCleanup,
} from "../controllers/dataRetentionController.js";
import { exportAuditLogs } from "../controllers/adminController.js";

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);

const checkAdmin = (req, res, next) => {
  if (req.userRole !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
};

router.use(checkAdmin);

// ===== VERIFICATION ROUTES =====
router.post("/verify-user", verifyUser);
router.get("/pending-verifications", getPendingVerifications);
router.get("/verified-users", getVerifiedUsers);

// ===== USER MANAGEMENT ROUTES =====
router.post("/create-user", createUser);
router.post("/manage-role", manageUserRole);
router.post("/update-permissions", updateUserPermissions);
router.get("/all-users", getAllUsers);

// ===== DATA RETENTION ROUTES =====
router.get("/retention-policy", getDataRetentionPolicy);
router.post("/retention-policy", updateDataRetentionPolicy);
router.post("/execute-cleanup", executeDataCleanup);

// ===== EMAIL & SMS TEST ROUTES =====
router.get("/test-email", async (req, res) => {
  try {
    const { testEmailService } = await import('../services/emailService.js');
    const result = await testEmailService();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/test-sms", async (req, res) => {
  try {
    const smsService = await import('../services/smsService.js');
    const result = await smsService.default.testSMSService();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get email logs
router.get("/email-logs", async (req, res) => {
  try {
    const { EmailLog } = await import('../models/EmailLog.js');
    const { limit = 50, status, emailType } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (emailType) query.emailType = emailType;
    
    const logs = await EmailLog.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'name email role');
    
    const stats = await EmailLog.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({ 
      success: true, 
      logs,
      stats: stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      total: logs.length 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get SMS logs
router.get("/sms-logs", async (req, res) => {
  try {
    const { SmsLog } = await import('../models/SmsLog.js');
    const { limit = 50, status, direction } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (direction) query.direction = direction;
    
    const logs = await SmsLog.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'name phoneNumber');
    
    const stats = await SmsLog.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({ 
      success: true, 
      logs,
      stats: stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      total: logs.length 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== EXPORT ROUTES =====
router.get("/export/incidents", exportIncidentsData);
router.get("/export/assignments", exportAssignmentsData);
router.get("/export/ngo-metrics", exportNGOMetricsData);
router.get('/audit-logs', exportAuditLogs);

export default router;
