import mongoose from "mongoose";

const dataRetentionPolicySchema = new mongoose.Schema(
  {
    // Policy settings
    requestRetentionDays: {
      type: Number,
      default: 365, // Keep requests for 1 year
      min: 30,
      max: 2555, // 7 years
    },
    assignmentRetentionDays: {
      type: Number,
      default: 180, // Keep assignments for 6 months
      min: 30,
      max: 2555,
    },
    auditLogRetentionDays: {
      type: Number,
      default: 90, // Keep audit logs for 3 months
      min: 30,
      max: 2555,
    },
    chatMessageRetentionDays: {
      type: Number,
      default: 90,
      min: 30,
      max: 2555,
    },

    // Automatic cleanup settings
    autoCleanupEnabled: {
      type: Boolean,
      default: true,
    },
    cleanupSchedule: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      default: "weekly",
    },
    lastCleanupAt: Date,
    nextCleanupAt: Date,

    // Archive settings (instead of delete, archive to external storage)
    archiveInsteadOfDelete: {
      type: Boolean,
      default: false,
    },
    archiveLocation: {
      type: String, // S3 bucket, local path, etc
      default: "local-archive",
    },

    // Exceptions (types of data to keep longer)
    exceptions: {
      keepCriticalRequests: { type: Boolean, default: true }, // Keep SOS/critical requests longer
      keepCompletedAssignments: { type: Boolean, default: true }, // Always keep completed
      keepFailedAssignments: { type: Boolean, default: true }, // Keep failed for audit
    },

    // Status tracking
    isActive: {
      type: Boolean,
      default: true,
    },

    // Who set this policy
    setBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    notes: String,
  },
  {
    timestamps: true,
  }
);

export const DataRetentionPolicy = mongoose.model("DataRetentionPolicy", dataRetentionPolicySchema);
