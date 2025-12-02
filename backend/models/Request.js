import mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
  {
    // Submitter info
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    submitterContact: {
      countryCode: { type: String, default: '+91' },
      phone: String,
      email: String,
      alternateCountryCode: { type: String, default: '+91' },
      alternateContact: String,
    },
    
    // Request type
    requestType: {
      type: String,
      enum: ["individual", "group", "community"],
      default: "individual",
    },
    
    // Location
    location: {
      type: {
        type: String,
        enum: ["Point", "Polygon"],
        default: "Point",
      },
      coordinates: {
        type: [],
        required: true,
      },
      address: String,
      landmark: String,
      area: String,
      city: String,
      state: String,
      pincode: String,
      accuracy: Number,
    },
    
    // Beneficiaries
    beneficiaries: {
      adults: { type: Number, default: 1 },
      children: { type: Number, default: 0 },
      elderly: { type: Number, default: 0 },
      infants: { type: Number, default: 0 },
      total: { type: Number, default: 1 },
    },
    
    // Needs
    // ✅ Needs
needs: {
  type: {
    rescue: {
      required: { type: Boolean, default: false },
      urgency: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" },
      details: String,
      quantity: Number,
    },
    food: {
      required: { type: Boolean, default: false },
      quantity: Number,
      details: String,
    },
    water: {
      required: { type: Boolean, default: false },
      quantity: Number,
      details: String,
    },
    medical: {
      required: { type: Boolean, default: false },
      urgency: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" },
      details: String,
    },
    shelter: {
      required: { type: Boolean, default: false },
      details: String,
    },
    transport: {
      required: { type: Boolean, default: false },
      details: String,
    },
    babySupplies: {
      required: { type: Boolean, default: false },
      items: [String],
      details: String,
    },
    sanitation: {
      required: { type: Boolean, default: false },
      items: [String],
      details: String,
    },
    power: {
      required: { type: Boolean, default: false },
      details: String,
    },
  },
  default: {},
},

// ✅ Special Needs
specialNeeds: {
  type: {
    medicalConditions: [String],
    disabilities: [String],
    pregnant: { type: Boolean, default: false },
    pets: {
      has: { type: Boolean, default: false },
      count: { type: Number, default: 0 },
    },
  },
  default: {},
},


    
    // Description/message from user
    description: {
      type: String,
      default: "",
    },

    // Priority & SoS
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical", "sos"],
      default: "medium",
    },
    selfDeclaredUrgency: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    // Priority change tracking
    priorityChangedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    priorityChangedAt: Date,
    sosDetected: {
      type: Boolean,
      default: false,
    },
    sosIndicators: {
      keywords: [String],
      trapped: Boolean,
      medicalEmergency: Boolean,
      repeatedCalls: Number,
      lowBattery: Boolean,
      poorSignal: Boolean,
    },
    
    // Evidence
    evidence: {
      photos: [{ data: String, timestamp: Date, description: String }],
      videos: [{ data: String, timestamp: Date, description: String }],
      voiceNotes: [{ data: String, timestamp: Date, duration: Number }],
      documents: [{ data: String, timestamp: Date, type: String }],
    },
    
    // Device info
    deviceInfo: {
      batteryLevel: Number,
      signalStrength: String,
      networkType: String,
      lastUpdated: Date,
    },
    
    // Status & Assignment
    status: {
      type: String,
      enum: ["new", "triaged", "assigned", "in-progress", "fulfilled", "closed", "cancelled"],
      default: "new",
    },
    assignments: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
    }],
    
    // Clustering
    clusterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RequestCluster",
    },
    isClusterLead: {
      type: Boolean,
      default: false,
    },
    
    // Triage
    triageNotes: String,
    triagedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    triagedAt: Date,
    
    // Messages/Updates
    messages: [{
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      senderRole: String,
      message: String,
      timestamp: { type: Date, default: Date.now },
      type: { type: String, default: "text" },
      metadata: mongoose.Schema.Types.Mixed,
    }],
    
    // Timeline
    timeline: [{
      action: String,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      timestamp: { type: Date, default: Date.now },
      details: String,
    }],
    
    // Fulfillment
    fulfilledAt: Date,
    fulfilledBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    fulfillmentProof: {
      photos: [String],
      signature: String,
      notes: String,
    },
    
    // ✅ Victim Fulfillment Confirmation (after NGO marks as fulfilled)
    fulfillmentConfirmation: {
      confirmedAt: Date,
      confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      notes: String,
      satisfaction: { type: Number, min: 1, max: 5, default: 5 },
      evidence: {
        photos: [{ data: String, timestamp: Date, description: String }],
        videos: [{ data: String, timestamp: Date, description: String }],
        voiceNotes: [{ data: String, timestamp: Date, duration: Number, description: String }],
      }
    },
    
    // Victim Closure Feedback & Evidence
    victimFeedback: {
      rating: { type: Number, min: 1, max: 5 },
      feedback: String,
      closurePhotos: [String], // Evidence photos from victim
      submittedAt: Date,
    },
    closedAt: Date,
    
    // Operator Features
    // Duplicate Detection
    isDuplicate: { type: Boolean, default: false },
    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
    },
    mergedInto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
    },
    duplicateScore: Number, // Similarity score (0-1)
    duplicateResolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    duplicateResolvedAt: Date,
    
    // Match Confirmation
    matchConfirmed: { type: Boolean, default: false },
    suggestedMatches: [{
      ngo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      score: Number, // Match score (0-1)
      distance: Number, // Distance in meters
      reason: String,
      suggestedAt: { type: Date, default: Date.now },
    }],
    matchConfirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    matchConfirmedAt: Date,
    
    // Escalation Handling
    isEscalated: { type: Boolean, default: false },
    escalationReason: String,
    escalatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    escalatedAt: Date,
    escalationStatus: {
      type: String,
      enum: ["pending", "under-review", "resolved", "forwarded"],
      default: "pending",
    },
    escalationNotes: String,
    escalationResolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    escalationResolvedAt: Date,
    
    // Metadata
    language: String,
    source: {
      type: String,
      enum: ["web", "mobile", "sms", "call", "csv", "social"],
      default: "web",
    },
    verified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
requestSchema.index({ "location.coordinates": "2dsphere" });
requestSchema.index({ status: 1, priority: 1 });
requestSchema.index({ submittedBy: 1 });
requestSchema.index({ clusterId: 1 });
requestSchema.index({ sosDetected: 1, priority: 1 });
// Avoid duplicate ticketNumber index warnings: do not define index here if unique already exists at schema level or elsewhere
requestSchema.index({ createdAt: -1 });

// Calculate total beneficiaries before save
requestSchema.pre("save", function (next) {
  if (this.beneficiaries) {
    this.beneficiaries.total =
      (this.beneficiaries.adults || 0) +
      (this.beneficiaries.children || 0) +
      (this.beneficiaries.elderly || 0) +
      (this.beneficiaries.infants || 0);
  }
  next();
});

export const Request = mongoose.model("Request", requestSchema);
