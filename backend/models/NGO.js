import mongoose from "mongoose";

const ngoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    countryCode: { type: String, default: '+91' },
    phone: String,
    
    // Admin user
    adminUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    // Team members
    teamMembers: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      role: String,
      permissions: [String],
    }],
    
    // Organization details
    registrationNumber: String,
    type: {
      type: String,
      enum: ["ngo", "volunteer-group", "government", "corporate", "individual"],
      default: "ngo",
    },
    
    // Location and coverage
    // Location is now optional - will be set when NGO creates their first offer
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: false, // Changed from true to false - location captured when creating first offer
      },
      address: String,
      city: String,
      state: String,
      pincode: String,
    },
    coverageRadius: {
      type: Number,
      default: 50000, // 50km in meters
    },
    coverageAreas: [{
      name: String,
      polygon: {
        type: {
          type: String,
          enum: ["Polygon"],
        },
        coordinates: [[[Number]]],
      },
    }],
    
    // Note: Capabilities and resources are now derived dynamically from active Offers
    // This eliminates redundancy and ensures data consistency
    
    // Capacity tracking
    activeAssignments: {
      type: Number,
      default: 0,
    },
    maxActiveAssignments: {
      type: Number,
      default: 50,
    },
    
    // Shift times
    operatingHours: {
      monday: { start: String, end: String, available: Boolean },
      tuesday: { start: String, end: String, available: Boolean },
      wednesday: { start: String, end: String, available: Boolean },
      thursday: { start: String, end: String, available: Boolean },
      friday: { start: String, end: String, available: Boolean },
      saturday: { start: String, end: String, available: Boolean },
      sunday: { start: String, end: String, available: Boolean },
    },
    available24x7: {
      type: Boolean,
      default: false,
    },
    
    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    verifiedAt: Date,
    
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastActive: Date,
    
    // Statistics
    stats: {
      totalAssignments: { type: Number, default: 0 },
      completedAssignments: { type: Number, default: 0 },
      averageResponseTime: { type: Number, default: 0 },
      rating: { type: Number, default: 5, min: 0, max: 5 },
      totalRatings: { type: Number, default: 0 },
      peopleHelped: { type: Number, default: 0 },
    },
    
    // Contact preferences
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
    },
    
    // Documents
    documents: {
      registration: String,
      license: String,
      insurance: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ngoSchema.index({ "location.coordinates": "2dsphere" });
ngoSchema.index({ isActive: 1, isVerified: 1, isOnline: 1 });
ngoSchema.index({ adminUser: 1 });

export const NGO = mongoose.model("NGO", ngoSchema);
