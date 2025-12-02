import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    // Action details
    action: {
      type: String,
      required: true,
      enum: [
        "user_login",
        "user_logout",
        "user_register",
        "user_update",
        "user_delete",
        "request_create",
        "request_update",
        "request_delete",
        "request_triage",
        "request_assign",
        "request_fulfill",
        "offer_create",
        "offer_update",
        "offer_delete",
        "assignment_create",
        "assignment_update",
        "assignment_complete",
        "assignment_cancel",
        "shelter_create",
        "shelter_update",
        "shelter_checkin",
        "shelter_checkout",
        "ngo_verify",
        "ngo_update",
        "ngo_location_updated",
        "cluster_create",
        "cluster_dissolve",
        "export_data",
        "system_config",
        "admin_create_user",
        "user_role_changed",
        "user_permissions_updated",
        "user_verified",
        "user_unverified",
        "password_reset_requested",
        "password_reset_completed",
        "password_changed",
        "other",
      ],
    },
    
    // Who performed the action
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    performedByRole: String,
    performedByName: String,
    performedByEmail: String,
    
    // Target of the action
    targetType: {
      type: String,
      enum: [
        "User",
        "Request",
        "Offer",
        "Assignment",
        "Shelter",
        "NGO",
        "RequestCluster",
        "System",
        // Additional resource types used across controllers
        "BlockedRoute",
        "Advisory",
      ],
    },
    targetId: mongoose.Schema.Types.ObjectId,
    targetName: String,
    
    // Details
    details: mongoose.Schema.Types.Mixed,
    
    // Changes (before/after)
    changes: {
      before: mongoose.Schema.Types.Mixed,
      after: mongoose.Schema.Types.Mixed,
    },
    
    // Request metadata
    ipAddress: String,
    userAgent: String,
    
    // Location
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: [Number],
    },
    
    // Status
    status: {
      type: String,
      enum: ["success", "failure", "partial"],
      default: "success",
    },
    errorMessage: String,
    
    // Severity
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
    },
    
    // Tags for filtering
    tags: [String],
    
    // Session
    sessionId: String,
    
    // Timestamp
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

// Indexes
auditLogSchema.index({ performedBy: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });

// Static method to log action
auditLogSchema.statics.log = async function(data) {
  try {
    const log = new this(data);
    await log.save();
    return log;
  } catch (error) {
    console.error("Failed to create audit log:", error);
    return null;
  }
};

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
