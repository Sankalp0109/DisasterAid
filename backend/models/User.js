import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    countryCode: { type: String, default: '+91' },
    phone: String,
    
    role: {
      type: String,
      enum: ["victim", "ngo", "authority", "operator", "admin"],
      required: true,
    },
    
    // Role-specific data
    organizationName: String, // For NGO
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
    },
    
    authorityLevel: {
      type: String,
      enum: ["district", "state", "national"],
    },
    
    // Profile
    profilePicture: String,
    language: {
      type: String,
      default: "en",
    },
    preferredCommunication: {
      type: [String],
      default: ["email"],
      enum: ["email", "sms", "call", "whatsapp"],
    },
    
    // Status
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastActive: Date,
    socketId: String,
    
    // Location (for authorities/operators)
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: [Number],
      address: String,
      city: String,
      state: String,
    },
    
    // Permissions (role-based, admin has all)
    permissions: {
      canTriage: { type: Boolean, default: false },
      canAssign: { type: Boolean, default: false },
      canVerify: { type: Boolean, default: false }, // Admin: verify NGOs/Authorities
      canManageShelters: { type: Boolean, default: false },
      canViewAnalytics: { type: Boolean, default: false },
      canExportData: { type: Boolean, default: false },
      canManageRoles: { type: Boolean, default: false }, // Admin: assign/modify roles
      canManageDataRetention: { type: Boolean, default: false }, // Admin: set retention policies
      canExportIncidents: { type: Boolean, default: false }, // Admin: export incident data
      canResolveDuplicates: { type: Boolean, default: false }, // Operator: resolve duplicate requests
      canConfirmMatches: { type: Boolean, default: false }, // Operator: confirm request-NGO matches
      canHandleEscalations: { type: Boolean, default: false }, // Operator: handle escalations
    },
    
    // Stats
    stats: {
      requestsSubmitted: { type: Number, default: 0 },
      requestsFulfilled: { type: Number, default: 0 },
      offersCreated: { type: Number, default: 0 },
      assignmentsCompleted: { type: Number, default: 0 },
    },
    
    // Security
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes (avoid duplicate email index; unique constraint already creates one)
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ "location.coordinates": "2dsphere" });

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

export const User = mongoose.model("User", userSchema);
