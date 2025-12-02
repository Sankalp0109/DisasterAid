import mongoose from "mongoose";

const shelterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    
    // Managed by
    managedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
    },
    authorityInCharge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    // Location
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
      landmark: String,
      city: String,
      state: String,
      pincode: String,
    },
    
    // Type & capacity
    type: {
      type: String,
      enum: ["school", "community-hall", "stadium", "tent", "temporary", "permanent"],
      required: true,
    },
    totalCapacity: {
      type: Number,
      required: true,
    },
    currentOccupancy: {
      type: Number,
      default: 0,
    },
    availableCapacity: {
      type: Number,
      required: true,
    },
    
    // Facilities & amenities
    facilities: {
      water: { type: Boolean, default: false },
      electricity: { type: Boolean, default: false },
      toilets: { type: Number, default: 0 },
      bathrooms: { type: Number, default: 0 },
      kitchen: { type: Boolean, default: false },
      medicalRoom: { type: Boolean, default: false },
      separateWomenSection: { type: Boolean, default: false },
      wheelchairAccessible: { type: Boolean, default: false },
      petFriendly: { type: Boolean, default: false },
    },
    
    amenities: [String],
    
    // Resources
    resources: {
      beds: { total: Number, available: Number },
      blankets: { total: Number, available: Number },
      foodStock: {
        meals: Number,
        lastRestocked: Date,
      },
      waterStock: {
        liters: Number,
        lastRestocked: Date,
      },
      medicalSupplies: [String],
      sanitationKits: Number,
    },
    
    // Staff
    staff: {
      volunteers: Number,
      medics: Number,
      security: Number,
      cooks: Number,
    },
    
    // Status
    status: {
      type: String,
      enum: ["active", "full", "closed", "under-setup"],
      default: "active",
    },
    isOperational: {
      type: Boolean,
      default: true,
    },
    
    // Operating hours
    operatingHours: {
      openTime: String,
      closeTime: String,
      is24x7: { type: Boolean, default: true },
    },
    
    // Occupants
    occupants: [{
      request: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Request",
      },
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      numberOfPeople: Number,
      checkedInAt: Date,
      expectedCheckout: Date,
      checkedOutAt: Date,
      bedNumber: String,
      specialNeeds: [String],
    }],
    
    // Restrictions
    restrictions: {
      maxStayDuration: Number, // in days
      requiresVerification: { type: Boolean, default: false },
      ageRestrictions: String,
      genderRestrictions: String,
      otherRestrictions: [String],
    },
    
    // Safety & conditions
    safetyFeatures: {
      fireExtinguishers: Boolean,
      firstAidKit: Boolean,
      emergencyExits: Number,
      securityPersonnel: Boolean,
    },
    
    weatherProtection: {
      rainProof: Boolean,
      windProof: Boolean,
      temperatureControlled: Boolean,
    },
    
    // Contact
    contactPerson: {
      name: String,
      countryCode: { type: String, default: '+91' },
      phone: String,
      email: String,
    },
    emergencyContact: String,
    
    // Statistics
    stats: {
      totalPeopleServed: { type: Number, default: 0 },
      averageStayDuration: { type: Number, default: 0 },
      peakOccupancy: { type: Number, default: 0 },
      totalCheckIns: { type: Number, default: 0 },
      totalCheckOuts: { type: Number, default: 0 },
    },
    
    // Updates & alerts
    updates: [{
      message: String,
      timestamp: { type: Date, default: Date.now },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      type: { type: String, enum: ["info", "warning", "critical"] },
    }],
    
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
    
    // Photos
    photos: [String],
    
    // Notes
    notes: String,
    specialInstructions: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
shelterSchema.index({ "location.coordinates": "2dsphere" });
shelterSchema.index({ status: 1, isOperational: 1 });
shelterSchema.index({ availableCapacity: 1 });
shelterSchema.index({ managedBy: 1 });

// Update available capacity
shelterSchema.pre("save", function (next) {
  this.availableCapacity = this.totalCapacity - this.currentOccupancy;
  
  if (this.availableCapacity <= 0) {
    this.status = "full";
  } else if (this.status === "full" && this.availableCapacity > 0) {
    this.status = "active";
  }
  
  next();
});

// Methods
shelterSchema.methods.checkIn = function(numberOfPeople) {
  if (this.availableCapacity >= numberOfPeople) {
    this.currentOccupancy += numberOfPeople;
    this.stats.totalCheckIns += 1;
    this.stats.totalPeopleServed += numberOfPeople;
    if (this.currentOccupancy > this.stats.peakOccupancy) {
      this.stats.peakOccupancy = this.currentOccupancy;
    }
    return true;
  }
  return false;
};

shelterSchema.methods.checkOut = function(numberOfPeople) {
  this.currentOccupancy = Math.max(0, this.currentOccupancy - numberOfPeople);
  this.stats.totalCheckOuts += 1;
};

export const Shelter = mongoose.model("Shelter", shelterSchema);
