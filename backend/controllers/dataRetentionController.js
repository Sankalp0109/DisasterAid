import { DataRetentionPolicy } from "../models/DataRetentionPolicy.js";
import { Request } from "../models/Request.js";
import { Assignment } from "../models/Assignment.js";
import { AuditLog } from "../models/AuditLog.js";
import { exportIncidents, exportAssignments, exportNGOMetrics } from "../services/exportService.js";

/**
 * Get current data retention policy
 */
export const getDataRetentionPolicy = async (req, res) => {
  try {
    let policy = await DataRetentionPolicy.findOne({ isActive: true }).populate("setBy", "name email");

    if (!policy) {
      // Create default policy if none exists
      policy = new DataRetentionPolicy({
        setBy: req.userId,
      });
      await policy.save();
    }

    res.json({ success: true, policy });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch policy", error: err.message });
  }
};

/**
 * Update data retention policy
 */
export const updateDataRetentionPolicy = async (req, res) => {
  try {
    const { requestRetentionDays, assignmentRetentionDays, auditLogRetentionDays, chatMessageRetentionDays, autoCleanupEnabled, cleanupSchedule, exceptions, notes } = req.body;

    let policy = await DataRetentionPolicy.findOne({ isActive: true });

    if (!policy) {
      policy = new DataRetentionPolicy();
    }

    // Update fields
    if (requestRetentionDays) policy.requestRetentionDays = requestRetentionDays;
    if (assignmentRetentionDays) policy.assignmentRetentionDays = assignmentRetentionDays;
    if (auditLogRetentionDays) policy.auditLogRetentionDays = auditLogRetentionDays;
    if (chatMessageRetentionDays) policy.chatMessageRetentionDays = chatMessageRetentionDays;
    if (autoCleanupEnabled !== undefined) policy.autoCleanupEnabled = autoCleanupEnabled;
    if (cleanupSchedule) policy.cleanupSchedule = cleanupSchedule;
    if (exceptions) policy.exceptions = exceptions;
    if (notes) policy.notes = notes;

    policy.setBy = req.userId;
    await policy.save();

    // Audit log
    await AuditLog.log({
      action: "data_retention_policy_updated",
      performedBy: req.userId,
      performedByRole: req.userRole,
      performedByName: req.userName,
      // Use allowed enum value for targetType
      targetType: "System",
      targetId: policy._id,
      details: {
        requestRetentionDays,
        assignmentRetentionDays,
        auditLogRetentionDays,
        autoCleanupEnabled,
      },
    });

    res.json({ success: true, message: "Policy updated successfully", policy });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update policy", error: err.message });
  }
};

/**
 * Export incidents (requests)
 */
export const exportIncidentsData = async (req, res) => {
  try {
    const { startDate, endDate, priority, status, format = "json" } = req.query;

    const filters = {
      startDate,
      endDate,
      priority: priority ? priority.split(",") : undefined,
      status: status ? status.split(",") : undefined,
      format,
    };

    const data = await exportIncidents(filters);

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="incidents.csv"');
      res.send(data);
    } else {
      res.json({ success: true, data });
    }

    // Audit log
    // Use generic export action and set targetType to Request
    await AuditLog.log({
      action: "export_data",
      performedBy: req.userId,
      performedByRole: req.userRole,
      performedByName: req.userName,
      targetType: "Request",
      details: filters,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to export incidents", error: err.message });
  }
};

/**
 * Export assignments
 */
export const exportAssignmentsData = async (req, res) => {
  try {
    const { startDate, endDate, status, ngoId, format = "json" } = req.query;

    const filters = {
      startDate,
      endDate,
      status,
      ngoId,
      format,
    };

    const data = await exportAssignments(filters);

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="assignments.csv"');
      res.send(data);
    } else {
      res.json({ success: true, data });
    }

    // Audit log
    // Use generic export action and set targetType to Assignment
    await AuditLog.log({
      action: "export_data",
      performedBy: req.userId,
      performedByRole: req.userRole,
      performedByName: req.userName,
      targetType: "Assignment",
      details: filters,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to export assignments", error: err.message });
  }
};

/**
 * Export NGO metrics
 */
export const exportNGOMetricsData = async (req, res) => {
  try {
    const { startDate, endDate, format = "json" } = req.query;

    const filters = {
      startDate,
      endDate,
      format,
    };

    const data = await exportNGOMetrics(filters);

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="ngo-metrics.csv"');
      res.send(data);
    } else {
      res.json({ success: true, data });
    }

    // Audit log
    // Use generic export action and set targetType to NGO
    await AuditLog.log({
      action: "export_data",
      performedBy: req.userId,
      performedByRole: req.userRole,
      performedByName: req.userName,
      targetType: "NGO",
      details: filters,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to export NGO metrics", error: err.message });
  }
};

/**
 * Execute cleanup based on retention policy (admin only)
 */
export const executeDataCleanup = async (req, res) => {
  try {
    const policy = await DataRetentionPolicy.findOne({ isActive: true });

    if (!policy) {
      return res.status(400).json({ success: false, message: "No active retention policy" });
    }

    const now = new Date();
    let cleanupStats = {
      requestsDeleted: 0,
      assignmentsDeleted: 0,
      auditLogsDeleted: 0,
    };

    // Delete old requests (unless critical)
    if (policy.requestRetentionDays) {
      const cutoffDate = new Date(now.getTime() - policy.requestRetentionDays * 24 * 60 * 60 * 1000);
      const result = await Request.deleteMany({
        createdAt: { $lt: cutoffDate },
        ...(policy.exceptions.keepCriticalRequests && { priority: { $nin: ["sos", "critical"] } }),
      });
      cleanupStats.requestsDeleted = result.deletedCount;
    }

    // Delete old assignments
    if (policy.assignmentRetentionDays) {
      const cutoffDate = new Date(now.getTime() - policy.assignmentRetentionDays * 24 * 60 * 60 * 1000);
      const result = await Assignment.deleteMany({
        createdAt: { $lt: cutoffDate },
        ...(policy.exceptions.keepCompletedAssignments && { status: { $ne: "fulfilled" } }),
      });
      cleanupStats.assignmentsDeleted = result.deletedCount;
    }

    // Delete old audit logs
    if (policy.auditLogRetentionDays) {
      const cutoffDate = new Date(now.getTime() - policy.auditLogRetentionDays * 24 * 60 * 60 * 1000);
      const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoffDate } });
      cleanupStats.auditLogsDeleted = result.deletedCount;
    }

    // Update last cleanup date
    policy.lastCleanupAt = now;
    if (policy.cleanupSchedule === "daily") {
      policy.nextCleanupAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else if (policy.cleanupSchedule === "weekly") {
      policy.nextCleanupAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (policy.cleanupSchedule === "monthly") {
      policy.nextCleanupAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    await policy.save();

    // Audit log
    await AuditLog.log({
      action: "data_cleanup_executed",
      performedBy: req.userId,
      performedByRole: req.userRole,
      performedByName: req.userName,
      // Use allowed enum value for targetType
      targetType: "System",
      details: cleanupStats,
    });

    res.json({ success: true, message: "Cleanup executed successfully", stats: cleanupStats });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to execute cleanup", error: err.message });
  }
};
