import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema(
  {
    // Ticket number
    ticketNumber: {
      type: String,
      unique: true,
      required: true,
    },
    
    // Request & Offer
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      required: true,
    },
    offer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
    },
    
    // Assigned to
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      required: true,
    },
    assignedTeam: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    
    // Assignment details
    category: {
      type: String,
      enum: ["rescue", "food", "water", "medical", "babySupplies", "sanitation", "shelter", "power", "transport", "general"],
      required: true,
    },
    quantity: Number,
    
    // Status
    status: {
      type: String,
      enum: ["new", "accepted", "rejected", "en-route", "arrived", "in-progress", "completed", "failed", "cancelled"],
      default: "new",
    },
    
    // Priority
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical", "sos"],
      default: "medium",
    },
    
    // Assignment method
    assignmentMethod: {
      type: String,
      enum: ["auto", "manual", "offer-match"],
      default: "auto",
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    
    // Location & routing
    pickupLocation: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: [Number],
      address: String,
    },
    deliveryLocation: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: [Number],
      address: String,
    },
    route: {
      distance: Number,
      duration: Number,
      waypoints: [String],
      blockedRoutes: [String],
    },
    
    // ETA & tracking
    estimatedArrival: Date,
    actualArrival: Date,
    estimatedCompletion: Date,
    actualCompletion: Date,
    
    // Progress tracking
    timeline: [{
      status: String,
      timestamp: { type: Date, default: Date.now },
      location: {
        type: {
          type: String,
          enum: ["Point"],
        },
        coordinates: [Number],
      },
      notes: String,
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    }],
    
    // Communication
    messages: [{
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      message: String,
      timestamp: { type: Date, default: Date.now },
      type: { type: String, default: "text" },
    }],
    
    // Fulfillment (item-level tracking)
    itemsFulfilled: [{
      itemType: String, // food, water, medical, etc.
      requested: Number,
      delivered: Number,
      fulfilled: { type: Boolean, default: false },
      proof: [String], // photo/document URLs
      notes: String,
    }],
    fulfillmentDetails: {
      deliveredQuantity: Number,
      deliveredAt: Date,
      deliveredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      recipientName: String,
      recipientSignature: String,
      photos: [String], // Delivery proof photos
      documents: [String], // Delivery proof documents
      notes: String,
    },
    // Victim acknowledgement
    victimAcknowledgement: {
      acknowledged: { type: Boolean, default: false },
      acknowledgedAt: Date,
      itemsReceived: [{ // Which items victim confirms receiving
        itemType: String,
        receivedQuantity: Number,
        satisfied: Boolean,
      }],
      feedback: String,
      rating: { type: Number, min: 1, max: 5 },
    },
    
    // ✅ Victim Fulfillment Confirmation (with evidence)
    victimConfirmation: {
      confirmedAt: Date,
      satisfaction: { type: Number, min: 1, max: 5 },
      notes: String,
      evidenceCount: {
        photos: { type: Number, default: 0 },
        videos: { type: Number, default: 0 },
        voiceNotes: { type: Number, default: 0 },
      }
    },
    victimConfirmedAt: Date,
    
    // Feedback & rating
    feedback: {
      rating: { type: Number, min: 1, max: 5 },
      comment: String,
      submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      submittedAt: Date,
    },
    
    // Issues & escalation
    issues: [{
      type: String,
      description: String,
      reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      reportedAt: Date,
      resolved: Boolean,
      resolvedAt: Date,
    }],
    isEscalated: {
      type: Boolean,
      default: false,
    },
    escalatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    escalatedAt: Date,
    
    // Cancellation
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cancelledAt: Date,
    cancellationReason: String,
    
    // Metadata
    notes: String,
    tags: [String],
  },
  {
    timestamps: true,
  }
);

// Indexes (ticketNumber unique already creates index; avoid duplicate definition)
assignmentSchema.index({ request: 1 });
assignmentSchema.index({ assignedTo: 1, status: 1 });
assignmentSchema.index({ status: 1, priority: 1 });
assignmentSchema.index({ createdAt: -1 });

// Generate ticket number
// Ensure ticketNumber exists before validation
assignmentSchema.pre("validate", async function (next) {
  try {
    if (!this.ticketNumber) {
      const count = await mongoose.model("Assignment").countDocuments();
      this.ticketNumber = `TKT-${Date.now()}-${String(count + 1).padStart(6, "0")}`;
    }
    next();
  } catch (err) {
    next(err);
  }
});

export const Assignment = mongoose.model("Assignment", assignmentSchema);
