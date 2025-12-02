import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    // Offered by
    offeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      required: true,
    },
    createdByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    // Offer details
    title: {
      type: String,
      required: true,
    },
    description: String,
    
    // Category
    category: {
      type: String,
      enum: ["rescue", "food", "water", "medical", "babySupplies", "sanitation", "shelter", "power", "transport"],
      required: true,
    },
    
    // Quantity & capacity
    totalQuantity: {
      type: Number,
      required: true,
    },
    availableQuantity: {
      type: Number,
      required: true,
    },
    unit: {
      type: String,
      default: "units",
    },
    
    // Location & coverage
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
      },
      address: String,
    },
    coverageRadius: {
      type: Number,
      default: 10000, // 10km
    },
    
    // Availability
    availableFrom: {
      type: Date,
      default: Date.now,
    },
    availableUntil: Date,
    
    // Specific details by category
    details: {
      // For food
      foodType: String,
      mealType: [String],
      isVegetarian: Boolean,
      
      // For medical
      medicalType: String,
      medicines: [String],
      equipment: [String],
      onCallMedics: Number, // Number of on-call medics
      
      // For transport
      vehicleType: String,
      vehicleCount: Number,
      seatingCapacity: Number,
      
      // For shelter
      shelterType: String,
      capacity: Number,
      amenities: [String],
      
      // For water
      waterType: String,
      
      // Shift information (available for all categories)
      shiftTimes: [{
        day: String, // Monday, Tuesday, etc. or "Daily"
        startTime: String, // HH:MM format
        endTime: String,   // HH:MM format
      }],
      
      // Generic
      additionalInfo: String,
    },
    
    // Conditions
    conditions: {
      requiresPickup: { type: Boolean, default: false },
      deliveryAvailable: { type: Boolean, default: true },
      requiresVerification: { type: Boolean, default: false },
      priorityGroups: [String],
    },
    
    // Status
    status: {
      type: String,
      enum: ["active", "paused", "exhausted", "expired", "cancelled"],
      default: "active",
    },
    
    // Assignments
    assignments: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
    }],
    
    // Statistics
    stats: {
      totalAllocated: { type: Number, default: 0 },
      totalFulfilled: { type: Number, default: 0 },
      peopleHelped: { type: Number, default: 0 },
      averageResponseTime: { type: Number, default: 0 },
    },
    
    // Verification
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    verifiedAt: Date,
    
    // Metadata
    tags: [String],
    notes: String,
    expiresAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes
offerSchema.index({ "location.coordinates": "2dsphere" });
offerSchema.index({ offeredBy: 1, status: 1 });
offerSchema.index({ category: 1, status: 1 });
offerSchema.index({ availableQuantity: 1 });
offerSchema.index({ expiresAt: 1 });

// Update available quantity when allocated
offerSchema.methods.allocate = function(quantity) {
  if (this.availableQuantity >= quantity) {
    this.availableQuantity -= quantity;
    this.stats.totalAllocated += quantity;
    if (this.availableQuantity === 0) {
      this.status = "exhausted";
    }
    return true;
  }
  return false;
};

// Release allocated quantity
offerSchema.methods.release = function(quantity) {
  this.availableQuantity += quantity;
  this.stats.totalAllocated -= quantity;
  if (this.status === "exhausted" && this.availableQuantity > 0) {
    this.status = "active";
  }
};

export const Offer = mongoose.model("Offer", offerSchema);
