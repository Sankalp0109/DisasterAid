import { Request } from "../models/Request.js";
import { AuditLog } from "../models/AuditLog.js";
import { findOrCreateCluster } from "../services/clusteringService.js";
import { autoMatchRequest } from "../services/matchingService.js";
import { enqueueAutoAssignment } from "../services/autoAssignmentService.js";
import { checkSoSStatus } from "../services/sosDetection.js";
import { parsePhoneNumber } from "../utils/phoneParser.js";

// Create new request
export const createRequest = async (req, res) => {
  try {
    console.log("📥 Received request body:", JSON.stringify(req.body, null, 2));
    
    const requestData = {
      ...req.body,
      submittedBy: req.userId,
      status: "new",
    };

    // 📱 Parse and separate phone numbers ONLY if they need parsing
    if (requestData.submitterContact) {
      // Parse main phone number - ONLY if countryCode is not already provided
      if (requestData.submitterContact.phone) {
        if (requestData.submitterContact.countryCode) {
          // Country code already provided - just clean the phone digits
          requestData.submitterContact.phone = String(requestData.submitterContact.phone).replace(/\D/g, '');
          console.log(`📞 Main Phone (already separated):
            Country Code: ${requestData.submitterContact.countryCode}
            Phone Number: ${requestData.submitterContact.phone}`);
        } else {
          // No country code provided - need to parse
          const parsed = parsePhoneNumber(requestData.submitterContact.phone);
          console.log(`📞 Main Phone Parsing:
            Input: ${requestData.submitterContact.phone}
            Country Code: ${parsed.countryCode}
            Phone Number: ${parsed.phoneNumber}
            Full Format: ${parsed.fullPhone}`);
          
          requestData.submitterContact.countryCode = parsed.countryCode;
          requestData.submitterContact.phone = parsed.phoneNumber;
        }
      }
      
      // Parse alternate contact number - ONLY if alternateCountryCode is not already provided
      if (requestData.submitterContact.alternateContact) {
        if (requestData.submitterContact.alternateCountryCode) {
          // Country code already provided - just clean the phone digits
          requestData.submitterContact.alternateContact = String(requestData.submitterContact.alternateContact).replace(/\D/g, '');
          console.log(`📞 Alternate Contact (already separated):
            Country Code: ${requestData.submitterContact.alternateCountryCode}
            Phone Number: ${requestData.submitterContact.alternateContact}`);
        } else {
          // No country code provided - need to parse
          const parsed = parsePhoneNumber(requestData.submitterContact.alternateContact);
          console.log(`📞 Alternate Contact Parsing:
            Input: ${requestData.submitterContact.alternateContact}
            Country Code: ${parsed.countryCode}
            Phone Number: ${parsed.phoneNumber}
            Full Format: ${parsed.fullPhone}`);
          
          requestData.submitterContact.alternateCountryCode = parsed.countryCode;
          requestData.submitterContact.alternateContact = parsed.phoneNumber;
        }
      }
    }

    // Basic validation: ensure location coords are provided
    const coords = requestData?.location?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2 || coords.some(v => typeof v !== 'number')) {
      return res.status(400).json({ success: false, message: "Valid location coordinates [lon, lat] are required" });
    }

    console.log("📦 Creating request with data:", JSON.stringify(requestData, null, 2));
    const request = new Request(requestData);

    // Check SoS status
    await checkSoSStatus(request);

    await request.save();
    console.log("✅ Request saved:", request._id);

    // Add to timeline
    request.timeline.push({
      action: "request_created",
      performedBy: req.userId,
      details: "Request submitted",
    });
    await request.save();

    // Audit log
    await AuditLog.log({
      action: "request_create",
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: "Request",
      targetId: request._id,
      details: { priority: request.priority, sosDetected: request.sosDetected },
      ipAddress: req.ip,
    });

    // Try clustering (async)
    findOrCreateCluster(request._id).catch(err => 
      console.error("Clustering error:", err)
    );

  // Enqueue for prioritized auto-assignment (non-blocking). This wraps autoMatchRequest with queue/backoff.
    enqueueAutoAssignment(request._id, request.priority);
  console.log("📤 Enqueued for auto-assignment:", request._id, request.priority);

    res.status(201).json({
      success: true,
      message: "Request created successfully",
      request: {
        id: request._id,
        priority: request.priority,
        sosDetected: request.sosDetected,
        status: request.status,
      },
    });
  } catch (error) {
    console.log("specialNeeds received:", req.body.specialNeeds);
    console.error("❌ Create request error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to create request",
      error: error.message,
    });
  }
};

// Get request by ID
export const getRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate("submittedBy", "name email phone")
      .populate({
        path: "assignments",
        populate: [
          { path: "assignedTo", select: "name phone location" },
          { path: "offer", select: "title category" }
        ]
      })
      .populate("clusterId");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Check permissions
    if (
      req.userRole === "victim" &&
      request.submittedBy._id.toString() !== req.userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get request",
      error: error.message,
    });
  }
};

// Get all requests (with filters)
export const getRequests = async (req, res) => {
  try {
    const {
      status,
      priority,
      sosOnly,
      clustered,
      page = 1,
      limit = 20,
      sortBy = "-createdAt",
    } = req.query;

    const query = {};

    // Role-based filtering
    if (req.userRole === "victim") {
      query.submittedBy = req.userId;
    }

    // Filters
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (sosOnly === "true") query.sosDetected = true;
    if (clustered === "true") query.clusterId = { $ne: null };
    if (clustered === "false") query.clusterId = null;

    const requests = await Request.find(query)
      .populate("submittedBy", "name email phone")
      .populate("clusterId", "clusterName totalBeneficiaries")
      .populate({
        path: "assignments",
        populate: [
          { path: "assignedTo", select: "name phone location" },
          { path: "offer", select: "title category" }
        ]
      })
      .sort(sortBy)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Request.countDocuments(query);

    res.json({
      success: true,
      requests,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get requests",
      error: error.message,
    });
  }
};

// Update request
export const updateRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Check permissions
    if (
      req.userRole === "victim" &&
      request.submittedBy.toString() !== req.userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const oldData = request.toObject();

    // Update fields
    Object.keys(req.body).forEach((key) => {
      if (req.body[key] !== undefined) {
        request[key] = req.body[key];
      }
    });

    // 📱 Parse and separate phone numbers if submitterContact is being updated - ONLY if not already separated
    if (req.body.submitterContact) {
      // Parse main phone number - ONLY if countryCode is not already provided
      if (req.body.submitterContact.phone) {
        if (req.body.submitterContact.countryCode) {
          // Country code already provided - just clean the phone digits
          request.submitterContact.phone = String(req.body.submitterContact.phone).replace(/\D/g, '');
          request.submitterContact.countryCode = req.body.submitterContact.countryCode;
          console.log(`📞 Main Phone Update (already separated):
            Country Code: ${request.submitterContact.countryCode}
            Phone Number: ${request.submitterContact.phone}`);
        } else {
          // No country code provided - need to parse
          const parsed = parsePhoneNumber(req.body.submitterContact.phone);
          console.log(`📞 Main Phone Parsing (Update):
            Input: ${req.body.submitterContact.phone}
            Country Code: ${parsed.countryCode}
            Phone Number: ${parsed.phoneNumber}
            Full Format: ${parsed.fullPhone}`);
          
          request.submitterContact.countryCode = parsed.countryCode;
          request.submitterContact.phone = parsed.phoneNumber;
        }
      }
      
      // Parse alternate contact number - ONLY if alternateCountryCode is not already provided
      if (req.body.submitterContact.alternateContact) {
        if (req.body.submitterContact.alternateCountryCode) {
          // Country code already provided - just clean the phone digits
          request.submitterContact.alternateContact = String(req.body.submitterContact.alternateContact).replace(/\D/g, '');
          request.submitterContact.alternateCountryCode = req.body.submitterContact.alternateCountryCode;
          console.log(`📞 Alternate Contact Update (already separated):
            Country Code: ${request.submitterContact.alternateCountryCode}
            Phone Number: ${request.submitterContact.alternateContact}`);
        } else {
          // No country code provided - need to parse
          const parsed = parsePhoneNumber(req.body.submitterContact.alternateContact);
          console.log(`📞 Alternate Contact Parsing (Update):
            Input: ${req.body.submitterContact.alternateContact}
            Country Code: ${parsed.countryCode}
            Phone Number: ${parsed.phoneNumber}
            Full Format: ${parsed.fullPhone}`);
          
          request.submitterContact.alternateCountryCode = parsed.countryCode;
          request.submitterContact.alternateContact = parsed.phoneNumber;
        }
      }
    }

    // Re-check SoS status
    await checkSoSStatus(request);

    request.lastActivity = new Date();
    await request.save();

    // Timeline
    request.timeline.push({
      action: "request_updated",
      performedBy: req.userId,
      details: "Request updated",
    });
    await request.save();

    // Audit log
    await AuditLog.log({
      action: "request_update",
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: "Request",
      targetId: request._id,
      changes: { before: oldData, after: request.toObject() },
    });

    res.json({
      success: true,
      message: "Request updated successfully",
      request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update request",
      error: error.message,
    });
  }
};

// Triage request (operator/authority only)
export const triageRequest = async (req, res) => {
  try {
    const { priority, triageNotes, assignToNGO } = req.body;

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    if (priority) request.priority = priority;
    if (triageNotes) request.triageNotes = triageNotes;
    request.triagedBy = req.userId;
    request.triagedAt = new Date();
    request.status = "triaged";

    await request.save();

    // Timeline
    request.timeline.push({
      action: "request_triaged",
      performedBy: req.userId,
      details: `Triaged as ${priority}`,
    });
    await request.save();

    // Audit log
    await AuditLog.log({
      action: "request_triage",
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: "Request",
      targetId: request._id,
      details: { priority, triageNotes },
    });

    // Emit Socket.IO stats update
    try {
      const { getIO } = await import('../socket/ioInstance.js');
      const io = getIO();
      io.emit('stats:updated', {
        timestamp: new Date(),
        eventType: 'request_triaged',
        requestId: request._id,
        priority: priority
      });
    } catch (err) {
      console.warn('Socket.IO emission failed:', err.message);
    }

    // If manual assignment requested
    if (assignToNGO) {
      // Handle manual assignment (implement in assignmentController)
    }

    res.json({
      success: true,
      message: "Request triaged successfully",
      request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to triage request",
      error: error.message,
    });
  }
};

// Add message to request
export const addMessage = async (req, res) => {
  try {
    const { message, type = "text", metadata } = req.body;

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    request.messages.push({
      sender: req.userId,
      senderRole: req.userRole,
      message,
      type,
      metadata,
      timestamp: new Date(),
    });

    request.lastActivity = new Date();
    await request.save();

    // Check for SoS in message
    await checkSoSStatus(request);
    await request.save();

    res.json({
      success: true,
      message: "Message added successfully",
      sosDetected: request.sosDetected,
      priority: request.priority,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to add message",
      error: error.message,
    });
  }
};

// Upload evidence
export const uploadEvidence = async (req, res) => {
  try {
    const { type, data, description } = req.body;

    if (!["photo", "video", "voiceNote", "document"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid evidence type",
      });
    }

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const evidenceItem = {
      data,
      timestamp: new Date(),
      description,
    };

    if (type === "photo") {
      request.evidence.photos.push(evidenceItem);
    } else if (type === "video") {
      request.evidence.videos.push(evidenceItem);
    } else if (type === "voiceNote") {
      request.evidence.voiceNotes.push(evidenceItem);
    } else if (type === "document") {
      request.evidence.documents.push(evidenceItem);
    }

    await request.save();

    res.json({
      success: true,
      message: "Evidence uploaded successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to upload evidence",
      error: error.message,
    });
  }
};

// Get SoS queue
export const getSoSQueue = async (req, res) => {
  try {
    const sosRequests = await Request.find({
      sosDetected: true,
      status: { $in: ["new", "triaged", "assigned"] },
    })
      .populate("submittedBy", "name phone")
      .populate("assignments")
      .sort({ priority: -1, createdAt: 1 })
      .limit(50);

    res.json({
      success: true,
      requests: sosRequests,
      count: sosRequests.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get SoS queue",
      error: error.message,
    });
  }
};

// Get requests by location
export const getRequestsByLocation = async (req, res) => {
  try {
    const { longitude, latitude, radius = 10000 } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: "Longitude and latitude required",
      });
    }

    const requests = await Request.find({
      status: { $in: ["new", "triaged", "assigned", "in-progress"] },
      "location.coordinates": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseInt(radius),
        },
      },
    })
      .populate("submittedBy", "name")
      .limit(100);

    res.json({
      success: true,
      requests,
      count: requests.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get requests by location",
      error: error.message,
    });
  }
};

// Update request priority (authority/admin only)
export const updateRequestPriority = async (req, res) => {
  try {
    const { priority } = req.body;

    // Validate priority
    const validPriorities = ["low", "medium", "high", "critical", "sos"];
    if (!priority || !validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority. Must be one of: low, medium, high, critical, sos",
      });
    }

    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Store old priority for audit log
    const oldPriority = request.priority;

    // Update priority
    request.priority = priority;
    request.priorityChangedBy = req.userId;
    request.priorityChangedAt = new Date();

    // ✅ CRITICAL FIX: When priority is set to "sos", also mark sosDetected as true
    // This ensures the request appears in the SOS queue
    if (priority === "sos") {
      request.sosDetected = true;
      console.log(`🚨 SOS Flag Activated: Request ${req.params.id} now marked as sosDetected`);
    }

    await request.save();

    // Log the action
    console.log(`🔄 Priority Updated: Request ${req.params.id}`);
    console.log(`   Old Priority: ${oldPriority}`);
    console.log(`   New Priority: ${priority}`);
    console.log(`   SOS Detected: ${request.sosDetected}`);
    console.log(`   Changed by: ${req.userName} (${req.userEmail})`);

    // Broadcast update to all connected clients
    const { getIO } = await import("../socket/ioInstance.js");
    const io = getIO();
    if (io) {
      io.emit('request:priority-updated', {
        requestId: req.params.id,
        oldPriority,
        newPriority: priority,
        sosDetected: request.sosDetected,
        changedBy: req.userName,
        changedAt: request.priorityChangedAt,
      });

      // ✅ If SOS priority, also emit SOS queue update event
      if (priority === "sos") {
        io.emit('sos:request-added', {
          requestId: req.params.id,
          priority: priority,
          submitterName: request.submitterContact?.name,
          addedAt: new Date(),
        });
      }
    }

    res.json({
      success: true,
      message: `Priority updated from ${oldPriority} to ${priority}${priority === "sos" ? " - Request added to SOS queue" : ""}`,
      request: {
        _id: request._id,
        priority: request.priority,
        sosDetected: request.sosDetected,
        priorityChangedBy: request.priorityChangedBy,
        priorityChangedAt: request.priorityChangedAt,
      },
    });
  } catch (error) {
    console.error("❌ Error updating request priority:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update request priority",
      error: error.message,
    });
  }
};

