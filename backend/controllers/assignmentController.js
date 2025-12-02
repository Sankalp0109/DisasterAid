import { Assignment } from "../models/Assignment.js";
import { Request } from "../models/Request.js";
import { Offer } from "../models/Offer.js";
import { NGO } from "../models/NGO.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { getIO } from "../socket/ioInstance.js";
// Note: Avoid Mongo transactions here to support standalone deployments

// Create manual assignment
export const createAssignment = async (req, res) => {
  try {
    const { requestId, ngoId, category, quantity, notes } = req.body;

    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    const ngo = await NGO.findById(ngoId);
    if (!ngo) {
      return res.status(404).json({ success: false, message: "NGO not found" });
    }

    const assignment = new Assignment({
      request: requestId,
      assignedTo: ngoId,
      category,
      quantity,
      priority: request.priority,
      assignmentMethod: "manual",
      assignedBy: req.userId,
      deliveryLocation: {
        type: "Point",
        coordinates: request.location.coordinates,
        address: request.location.address,
      },
      notes,
    });

    await assignment.save();

    // Update request
    request.assignments.push(assignment._id);
    if (request.status === "new" || request.status === "triaged") {
      request.status = "assigned";
    }
    request.timeline.push({
      action: "assigned",
      performedBy: req.userId,
      details: `Assigned to ${ngo.name}`,
    });
    await request.save();

    // Update NGO
    ngo.activeAssignments += 1;
    await ngo.save();

    // Audit log
    await AuditLog.log({
      action: "assignment_create",
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: "Assignment",
      targetId: assignment._id,
      details: { requestId, ngoId, category },
    });

    res.status(201).json({
      success: true,
      message: "Assignment created successfully",
      assignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create assignment",
      error: error.message,
    });
  }
};

// Get assignments
export const getAssignments = async (req, res) => {
  try {
    const { status, priority, ngoId, page = 1, limit = 20 } = req.query;

    const query = {};

    if (status) query.status = status;
    if (priority) query.priority = priority;

    // Role-based filtering
    if (req.userRole === "ngo") {
      const user = await req.user.populate("organizationId");
      query.assignedTo = user.organizationId._id;
    } else if (ngoId) {
      query.assignedTo = ngoId;
    }

    const assignments = await Assignment.find(query)
      .populate("request", "location beneficiaries priority status phoneNumber phone submitterContact socialMedia")
      .populate("assignedTo", "name phone location coverageRadius")
      .populate("offer", "title category")
      .sort("-createdAt")
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Assignment.countDocuments(query);

    res.json({
      success: true,
      assignments,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get assignments",
      error: error.message,
    });
  }
};

// Get assignment by ID
export const getAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate("request")
      .populate("assignedTo")
      .populate("offer")
      .populate("assignedTeam", "name phone");

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    res.json({
      success: true,
      assignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get assignment",
      error: error.message,
    });
  }
};

// Update assignment status
export const updateAssignmentStatus = async (req, res) => {
  try {
    const { status, notes, location } = req.body;

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    const oldStatus = assignment.status;
  assignment.status = status;

    // Add to timeline
    assignment.timeline.push({
      status,
      timestamp: new Date(),
      location: location ? { type: "Point", coordinates: location } : undefined,
      notes,
      updatedBy: req.userId,
    });

    // Update timestamps
    if (status === "arrived") {
      assignment.actualArrival = new Date();
    } else if (status === "completed") {
      assignment.actualCompletion = new Date();
      
      // Update request status
      const request = await Request.findById(assignment.request);
      if (request) {
        // Check if all OTHER assignments are completed/fulfilled/cancelled
        const incompleteAssignments = await Assignment.find({
          request: request._id,
          _id: { $ne: assignment._id }, // Exclude current assignment
          status: { $nin: ["completed", "fulfilled", "cancelled"] }
        });
        
        if (incompleteAssignments.length === 0) {
          request.status = "fulfilled";
          request.fulfilledAt = new Date();
          await request.save();
        }
      }

      // Update NGO stats
      const ngo = await NGO.findById(assignment.assignedTo);
      if (ngo) {
        ngo.activeAssignments = Math.max(0, ngo.activeAssignments - 1);
        ngo.stats.completedAssignments += 1;
        await ngo.save();
      }
    }

    // NEW: If NGO declines early, allow return to triaged state & requeue
    if (status === "rejected") {
      const request = await Request.findById(assignment.request);
      if (request) {
        // Remove this assignment reference
        request.assignments = request.assignments.filter(aId => aId.toString() !== assignment._id.toString());
        // If no remaining assignments, revert status to triaged to re-attempt matching
        if (request.assignments.length === 0) {
          request.status = "triaged"; // or back to new? triaged indicates manual oversight potential
        }
        await request.save();
      }
      const ngo = await NGO.findById(assignment.assignedTo);
      if (ngo) {
        ngo.activeAssignments = Math.max(0, ngo.activeAssignments - 1);
        await ngo.save();
      }
    }

    await assignment.save();

    // Audit log
    await AuditLog.log({
      action: "assignment_update",
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: "Assignment",
      targetId: assignment._id,
      details: { oldStatus, newStatus: status },
    });

    // Emit Socket.IO events for real-time updates
    try {
      const io = getIO();
      
      // 1. Notify assignment-specific room
      io.to(`assignment:${assignment._id}`).emit('assignment:status-changed', {
        assignmentId: assignment._id,
        status: assignment.status,
        timestamp: new Date(),
        ngoId: assignment.assignedTo,
        previousStatus: oldStatus,
        location: location || assignment.deliveryLocation
      });

      // 2. Notify request room (victim sees this)
      io.to(`request:${assignment.request}`).emit('request:assignment-updated', {
        assignmentId: assignment._id,
        requestId: assignment.request,
        status: assignment.status,
        timestamp: new Date(),
        ngoId: assignment.assignedTo,
        updateMessage: `Assignment ${assignment.status.replace('-', ' ')} updated`
      });

      // 3. Direct notification to victim
      const request = await Request.findById(assignment.request);
      if (request && request.submittedBy) {
        io.to(`user:${request.submittedBy}`).emit('assignment:status-update', {
          assignmentId: assignment._id,
          requestId: request._id,
          status: assignment.status,
          message: `Your assignment is now ${assignment.status.replace('-', ' ')}`
        });
      }

      // 4. Notify operators/authority
      io.to('role:operator').to('role:authority').emit('assignment:status-changed', {
        assignmentId: assignment._id,
        requestId: assignment.request,
        status: assignment.status,
        ngoId: assignment.assignedTo
      });

      // 5. Broadcast stats update to dashboard
      io.emit('stats:updated', {
        timestamp: new Date(),
        eventType: 'assignment_status_update',
        assignmentId: assignment._id
      });
    } catch (err) {
      console.warn('Socket.IO emission failed:', err.message);
    }

    res.json({
      success: true,
      message: "Assignment status updated",
      assignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update assignment status",
      error: error.message,
    });
  }
};

// NGO confirm assignment (explicit accept & stock adjustment for generic NGO assignment)
export const confirmAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });

    // Ownership check: NGO user only
    if (req.userRole === 'ngo') {
      const user = await req.user.populate('organizationId');
      if (!user.organizationId || assignment.assignedTo.toString() !== user.organizationId._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (['completed','cancelled','rejected'].includes(assignment.status)) {
      return res.status(400).json({ success: false, message: 'Cannot confirm finalized assignment' });
    }

    // Transition: new|accepted -> in-progress (explicit confirmation)
    const previous = assignment.status;
    assignment.status = 'in-progress';
    assignment.timeline.push({ status: 'in-progress', timestamp: new Date(), notes: 'NGO confirmed resources' });
    await assignment.save();
    console.log(`✅ Assignment ${assignment._id} confirmed: ${previous} → in-progress`);

    // Update request status to in-progress
    const request = await Request.findById(assignment.request);
    if (request && request.status !== 'in-progress') {
      const oldRequestStatus = request.status;
      request.status = 'in-progress';
      request.timeline.push({
        action: 'in-progress',
        performedBy: req.userId,
        details: 'Assignment confirmed and started'
      });
      await request.save();
      console.log(`✅ Request ${request._id} status updated: ${oldRequestStatus} → in-progress`);
    }

    // If offer-based assignment, stock already allocated at creation.
    // Note: NGO capacity is now calculated from active offers, no need to manually adjust

    await AuditLog.log({
      action: 'assignment_confirm',
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: 'Assignment',
      targetId: assignment._id,
      details: { previous, newStatus: 'in-progress' }
    });

    // Emit Socket.IO events for real-time updates
    try {
      const io = getIO();
      
      console.log(`📡 Emitting Socket.IO events for assignment ${assignment._id}`);
      
      // Notify assignment room
      io.to(`assignment:${assignment._id}`).emit('assignment:status-changed', {
        assignmentId: assignment._id,
        status: 'in-progress',
        timestamp: new Date(),
        ngoId: assignment.assignedTo,
        previousStatus: previous
      });

      // Notify request room (victim sees this)
      io.to(`request:${assignment.request}`).emit('request:assignment-updated', {
        assignmentId: assignment._id,
        requestId: assignment.request,
        status: 'in-progress',
        timestamp: new Date(),
        updateMessage: 'Assignment confirmed and in progress'
      });

      // Direct notification to victim
      if (request && request.submittedBy) {
        io.to(`user:${request.submittedBy}`).emit('assignment:status-update', {
          assignmentId: assignment._id,
          requestId: request._id,
          status: 'in-progress',
          message: 'Your assignment is now in progress'
        });
      }

      // Notify operators/authority
      io.to('role:operator').to('role:authority').emit('assignment:status-changed', {
        assignmentId: assignment._id,
        requestId: assignment.request,
        status: 'in-progress',
        ngoId: assignment.assignedTo
      });

      // Broadcast stats update to dashboard
      io.emit('stats:updated', {
        timestamp: new Date(),
        eventType: 'assignment_confirmed',
        assignmentId: assignment._id
      });
      console.log(`✅ All Socket.IO events emitted for assignment confirmation`);
    } catch (err) {
      console.warn('Socket.IO emission failed:', err.message);
    }

    res.json({ success: true, message: 'Assignment confirmed', assignment });
  } catch (err) {
    console.error('❌ Error confirming assignment:', err.message);
    res.status(500).json({ success: false, message: 'Failed to confirm assignment', error: err.message });
  }
};

// NGO decline assignment (return to triaged & requeue matching)
export const declineAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    if (req.userRole === 'ngo') {
      const user = await req.user.populate('organizationId');
      if (!user.organizationId || assignment.assignedTo.toString() !== user.organizationId._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (['completed','cancelled'].includes(assignment.status)) {
      return res.status(400).json({ success: false, message: 'Cannot decline finalized assignment' });
    }

    const request = await Request.findById(assignment.request);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found for assignment' });
    }

    // Remove assignment reference from request
    request.assignments = request.assignments.filter(aId => aId.toString() !== assignment._id.toString());
    if (request.assignments.length === 0) {
      request.status = 'triaged';
    }
    await request.save();

    // Release offer quantity if offer-based
    if (assignment.offer && assignment.quantity) {
      try {
        const offer = await Offer.findById(assignment.offer);
        if (offer) {
          offer.release(assignment.quantity);
          await offer.save();
        }
      } catch (e) { /* noop */ }
    }

    // Update NGO active assignments
    try {
      const ngo = await NGO.findById(assignment.assignedTo);
      if (ngo) {
        ngo.activeAssignments = Math.max(0, ngo.activeAssignments - 1);
        await ngo.save();
      }
    } catch (e) { /* noop */ }

    // Mark assignment cancelled
    assignment.status = 'cancelled';
    assignment.cancelledBy = req.userId;
    assignment.cancelledAt = new Date();
    assignment.cancellationReason = 'Declined by NGO';
    assignment.timeline.push({ status: 'cancelled', timestamp: new Date(), notes: 'Declined by NGO' });
    await assignment.save();

    await AuditLog.log({
      action: 'assignment_decline',
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: 'Assignment',
      targetId: assignment._id,
      details: { reason: 'Declined by NGO' }
    });

    // Re-enqueue request for rematching (import inline to avoid circular)
    try {
      const { enqueueAutoAssignment } = await import('../services/autoAssignmentService.js');
      enqueueAutoAssignment(request._id, request.priority);
    } catch (e) { console.error('Failed to re-enqueue request:', e.message); }

    res.json({ success: true, message: 'Assignment declined and requeued', requestId: request._id });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to decline assignment', error: err.message });
  }
};

// Add fulfillment proof
export const addFulfillmentProof = async (req, res) => {
  try {
    const { deliveredQuantity, recipientName, recipientSignature, photos, notes } = req.body;

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    assignment.fulfillmentDetails = {
      deliveredQuantity,
      deliveredAt: new Date(),
      deliveredBy: req.userId,
      recipientName,
      recipientSignature,
      photos,
      notes,
    };

    assignment.status = "completed";
    assignment.actualCompletion = new Date();

    await assignment.save();

    // Update offer stats if from offer
    if (assignment.offer) {
      const offer = await Offer.findById(assignment.offer);
      if (offer) {
        offer.stats.totalFulfilled += deliveredQuantity || 0;
        await offer.save();
      }
    }

    res.json({
      success: true,
      message: "Fulfillment proof added",
      assignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to add fulfillment proof",
      error: error.message,
    });
  }
};

// Add message to assignment
export const addAssignmentMessage = async (req, res) => {
  try {
    const { message } = req.body;

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    assignment.messages.push({
      sender: req.userId,
      message,
      timestamp: new Date(),
    });

    await assignment.save();

    res.json({
      success: true,
      message: "Message added",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to add message",
      error: error.message,
    });
  }
};

// Report issue
export const reportIssue = async (req, res) => {
  try {
    const { type, description } = req.body;

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    assignment.issues.push({
      type,
      description,
      reportedBy: req.userId,
      reportedAt: new Date(),
      resolved: false,
    });

    await assignment.save();

    res.json({
      success: true,
      message: "Issue reported",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to report issue",
      error: error.message,
    });
  }
};

// Cancel assignment
export const cancelAssignment = async (req, res) => {
  try {
    const { reason } = req.body;

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    assignment.status = "cancelled";
    assignment.cancelledBy = req.userId;
    assignment.cancelledAt = new Date();
    assignment.cancellationReason = reason;

    await assignment.save();

    // Release offer quantity if from offer
    if (assignment.offer) {
      const offer = await Offer.findById(assignment.offer);
      if (offer && assignment.quantity) {
        offer.release(assignment.quantity);
        await offer.save();
      }
    }

    // Update NGO
    const ngo = await NGO.findById(assignment.assignedTo);
    if (ngo) {
      ngo.activeAssignments = Math.max(0, ngo.activeAssignments - 1);
      await ngo.save();
    }

    // Audit log
    await AuditLog.log({
      action: "assignment_cancel",
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: "Assignment",
      targetId: assignment._id,
      details: { reason },
    });

    res.json({
      success: true,
      message: "Assignment cancelled",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to cancel assignment",
      error: error.message,
    });
  }
};

// NGO upload delivery proof with item tracking
export const uploadDeliveryProof = async (req, res) => {
  try {
    const { itemsFulfilled, photos, documents, notes } = req.body;
    
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    // Check ownership
    if (req.userRole === 'ngo') {
      const user = await req.user.populate('organizationId');
      if (!user.organizationId || assignment.assignedTo.toString() !== user.organizationId._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Update item-level fulfillment
    if (itemsFulfilled && Array.isArray(itemsFulfilled)) {
      assignment.itemsFulfilled = itemsFulfilled.map(item => ({
        itemType: item.itemType,
        requested: item.requested || 0,
        delivered: item.delivered || 0,
        fulfilled: item.delivered >= item.requested,
        proof: item.proof || [],
        notes: item.notes || ''
      }));
    }

    // Update fulfillment details
    assignment.fulfillmentDetails = {
      ...assignment.fulfillmentDetails,
      deliveredAt: new Date(),
      deliveredBy: req.userId,
      photos: photos || [],
      documents: documents || [],
      notes: notes || ''
    };

    // Mark as completed (pending victim acknowledgement)
    assignment.status = 'completed';
    assignment.actualCompletion = new Date();
    assignment.timeline.push({
      status: 'completed',
      timestamp: new Date(),
      notes: 'NGO uploaded delivery proof',
      updatedBy: req.userId
    });

    await assignment.save();

    await AuditLog.log({
      action: 'delivery_proof_upload',
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: 'Assignment',
      targetId: assignment._id,
      details: { itemCount: itemsFulfilled?.length || 0 }
    });

    res.json({
      success: true,
      message: 'Delivery proof uploaded successfully',
      assignment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to upload delivery proof',
      error: error.message
    });
  }
};

// Victim acknowledge delivery and mark items received
export const acknowledgeDelivery = async (req, res) => {
  try {
    const { itemsReceived, feedback, rating } = req.body;

    const assignment = await Assignment.findById(req.params.id).populate('request');
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    // Check victim ownership
    if (req.userRole === 'victim') {
      if (!assignment.request || assignment.request.submittedBy.toString() !== req.userId.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied - not your request' });
      }
    }

    // Update victim acknowledgement
    assignment.victimAcknowledgement = {
      acknowledged: true,
      acknowledgedAt: new Date(),
      itemsReceived: itemsReceived || [],
      feedback: feedback || '',
      rating: rating || null
    };

    assignment.timeline.push({
      status: 'acknowledged',
      timestamp: new Date(),
      notes: 'Victim acknowledged delivery',
      updatedBy: req.userId
    });

    await assignment.save();

    // Check if all items satisfied - if not, create reassignment for unfulfilled items
    const unsatisfiedItems = itemsReceived?.filter(item => !item.satisfied) || [];
    
    if (unsatisfiedItems.length > 0) {
      // Mark this assignment as partially fulfilled
      assignment.notes = (assignment.notes || '') + `\nPartially fulfilled - ${unsatisfiedItems.length} items unsatisfied`;
      await assignment.save();

      // Create reassignment for unfulfilled items
      const request = await Request.findById(assignment.request._id);
      if (request) {
        // Mark items for reassignment in request
        request.status = 'triaged'; // Reset to allow reassignment
        request.notes = (request.notes || '') + `\nReassignment needed for: ${unsatisfiedItems.map(i => i.itemType).join(', ')}`;
        await request.save();

        // Re-enqueue for auto-assignment
        try {
          const { enqueueAutoAssignment } = await import('../services/autoAssignmentService.js');
          enqueueAutoAssignment(request._id, 'high'); // Escalate priority
          console.log(`🔄 Reassigning unfulfilled items for request ${request._id}`);
        } catch (e) {
          console.error('Failed to reassign unfulfilled items:', e.message);
        }
      }
    } else {
      // All items satisfied - mark request as truly fulfilled
      const request = await Request.findById(assignment.request._id);
      if (request) {
        // Check if all assignments for this request are acknowledged
        const allAssignments = await Assignment.find({ request: request._id });
        const allAcknowledged = allAssignments.every(a => a.victimAcknowledgement?.acknowledged);
        
        if (allAcknowledged) {
          request.status = 'fulfilled';
          request.fulfilledAt = new Date();
          await request.save();
        }
      }
    }

    await AuditLog.log({
      action: 'delivery_acknowledge',
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: 'Assignment',
      targetId: assignment._id,
      details: { 
        itemsReceived: itemsReceived?.length || 0,
        unsatisfiedCount: unsatisfiedItems.length,
        rating
      }
    });

    res.json({
      success: true,
      message: unsatisfiedItems.length > 0 
        ? 'Acknowledgement recorded. Unfulfilled items will be reassigned.' 
        : 'Delivery acknowledged successfully',
      assignment,
      reassignmentNeeded: unsatisfiedItems.length > 0
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to acknowledge delivery',
      error: error.message
    });
  }
};

/**
 * NGO marks assignment as fulfilled (all items delivered)
 * Transitions: in-progress → fulfilled
 */
export const markAsDelivered = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { deliveryNotes, photos } = req.body;

    console.log('📦 markAsDelivered called:', { assignmentId, deliveryNotes, userRole: req.userRole, userId: req.userId });

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      console.log('❌ Assignment not found:', assignmentId);
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    console.log('✅ Assignment found:', { id: assignment._id, status: assignment.status, assignedTo: assignment.assignedTo });

    // Verify NGO is authorized
    if (req.userRole === 'ngo') {
      const user = await User.findById(req.userId).populate('organizationId');
      console.log('🔐 Authorization check:', {
        userId: req.userId,
        userOrgId: user?.organizationId?._id,
        assignmentAssignedTo: assignment.assignedTo
      });
      
      if (!user.organizationId || assignment.assignedTo.toString() !== user.organizationId._id.toString()) {
        console.log('❌ NGO Authorization Failed:', {
          userId: req.userId,
          organizationId: user?.organizationId?._id,
          assignedTo: assignment.assignedTo
        });
        return res.status(403).json({ success: false, message: "Not authorized" });
      }
      console.log('✅ NGO Authorization Passed');
    } else if (req.userRole !== 'admin') {
      console.log('❌ User is not NGO or admin:', req.userRole);
      return res.status(403).json({ success: false, message: "Only NGO or admin can mark delivery" });
    }

    const previousStatus = assignment.status;

    // Update assignment
    assignment.status = 'completed';
    assignment.actualCompletion = new Date();
    if (deliveryNotes) assignment.notes = deliveryNotes;
    if (photos) {
      assignment.fulfillmentDetails.photos = photos;
    }
    await assignment.save();
    console.log('✅ Assignment saved with status: completed');

    // Update request status
    const request = await Request.findById(assignment.request);
    if (request) {
      // Check if all assignments for this request are completed
      const allAssignments = await Assignment.find({ request: request._id });
      const allCompleted = allAssignments.every(a => a.status === 'completed');
      
      if (allCompleted) {
        request.status = 'fulfilled';
        request.fulfilledAt = new Date();
      } else {
        request.status = 'in-progress'; // Some assignments still pending
      }
      request.timeline.push({
        action: 'delivered',
        performedBy: req.userId,
        details: 'NGO marked assignment as delivered'
      });
      await request.save();
      console.log('✅ Request saved with status:', request.status);
    }

    // Audit log
    await AuditLog.log({
      action: 'assignment_delivered',
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: 'Assignment',
      targetId: assignment._id,
      details: { previousStatus, newStatus: 'completed', deliveryNotes }
    });
    console.log('✅ Audit log created');

    // Emit Socket.IO events for real-time updates
    try {
      const io = getIO();
      
      // Notify assignment room
      io.to(`assignment:${assignmentId}`).emit('assignment:status-changed', {
        assignmentId: assignment._id,
        status: 'completed',
        timestamp: new Date(),
        deliveryNotes
      });

      // Notify request room
      io.to(`request:${assignment.request}`).emit('request:assignment-fulfilled', {
        assignmentId: assignment._id,
        requestStatus: request?.status,
        allCompleted: request?.status === 'fulfilled'
      });

      // Notify victim
      if (request && request.submittedBy) {
        io.to(`user:${request.submittedBy}`).emit('delivery:confirmed', {
          requestId: request._id,
          assignmentId: assignment._id,
          timestamp: new Date()
        });
      }
      console.log('✅ Socket.IO events emitted');
    } catch (err) {
      console.warn('⚠️ Socket.IO emission failed:', err.message);
    }

    console.log('✅ markAsDelivered completed successfully');
    res.json({
      success: true,
      message: 'Assignment marked as delivered',
      assignment,
      requestStatus: request?.status
    });
  } catch (error) {
    console.error('❌ markAsDelivered error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark as delivered',
      error: error.message
    });
  }
};

/**
 * Victim confirms receipt and closes assignment/request
 * Transitions: fulfilled → closed
 */
export const closeRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { feedback, rating, satisfactionLevel, closurePhotos, evidence } = req.body;

    console.log('📋 closeRequest called:', { 
      requestId, 
      userRole: req.userRole, 
      userId: req.userId,
      hasLegacyPhotos: Array.isArray(closurePhotos),
      hasNewEvidence: !!evidence,
      evidenceTypes: evidence ? Object.keys(evidence) : [],
      photosCount: closurePhotos?.length || evidence?.photos?.length || 0,
      videosCount: evidence?.videos?.length || 0,
      audiosCount: evidence?.voiceNotes?.length || 0
    });

    if (!requestId) {
      console.error('❌ Missing requestId');
      return res.status(400).json({ success: false, message: "Request ID is required" });
    }

    const request = await Request.findById(requestId);
    if (!request) {
      console.log('❌ Request not found:', requestId);
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    console.log('✅ Request found:', { id: request._id, currentStatus: request.status });

    // Verify victim is authorized - compare as strings
    const submittedByStr = request.submittedBy.toString();
    const userIdStr = req.userId.toString();
    
    console.log('🔐 Comparing IDs:', { 
      submittedBy: submittedByStr, 
      userId: userIdStr,
      match: submittedByStr === userIdStr,
      userRole: req.userRole
    });

    if (submittedByStr !== userIdStr && req.userRole !== 'admin') {
      console.log('❌ Victim Authorization Failed');
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    console.log('✅ Victim Authorization Passed');

    const previousStatus = request.status;

    // Validate evidence - support both old and new formats
    let validatedEvidence = {
      photos: [],
      videos: [],
      voiceNotes: []
    };

    // Handle legacy format (old closurePhotos array)
    if (Array.isArray(closurePhotos) && closurePhotos.length > 0) {
      validatedEvidence.photos = closurePhotos.filter(p => typeof p === 'string' && p.length > 0);
      console.log('🖼️ Legacy photos validated:', validatedEvidence.photos.length);
    }

    // Handle new format (evidence object with photos, videos, voiceNotes)
    if (evidence) {
      if (Array.isArray(evidence.photos)) {
        validatedEvidence.photos = evidence.photos.filter(p => 
          typeof p === 'object' && p.data && typeof p.data === 'string' && p.data.length > 0
        );
        console.log('� Photos validated:', validatedEvidence.photos.length);
      }
      if (Array.isArray(evidence.videos)) {
        validatedEvidence.videos = evidence.videos
          .filter(v => typeof v === 'object' && v.data && typeof v.data === 'string' && v.data.length > 0)
          .map(v => ({
            data: v.data,
            description: v.description || '',
            filename: v.filename || 'video.mp4',
            timestamp: v.timestamp && !isNaN(new Date(v.timestamp).getTime()) ? new Date(v.timestamp) : new Date()
          }));
        console.log('🎥 Videos validated:', validatedEvidence.videos.length);
      }
      if (Array.isArray(evidence.voiceNotes)) {
        validatedEvidence.voiceNotes = evidence.voiceNotes
          .filter(a => typeof a === 'object' && a.data && typeof a.data === 'string' && a.data.length > 0)
          .map(a => ({
            data: a.data,
            description: a.description || '',
            filename: a.filename || 'audio.wav',
            timestamp: a.timestamp && !isNaN(new Date(a.timestamp).getTime()) ? new Date(a.timestamp) : new Date(),
            duration: a.duration || 0
          }));
        console.log('🎤 Audio validated:', validatedEvidence.voiceNotes.length);
      }
    }

    const totalEvidenceCount = validatedEvidence.photos.length + validatedEvidence.videos.length + validatedEvidence.voiceNotes.length;
    console.log('✅ Total evidence validated:', { 
      photos: validatedEvidence.photos.length,
      videos: validatedEvidence.videos.length,
      audio: validatedEvidence.voiceNotes.length,
      total: totalEvidenceCount
    });

    // Update request status
    request.status = 'closed';
    request.closedAt = new Date();
    
    // Store evidence in new fulfillmentConfirmation format
    request.fulfillmentConfirmation = {
      satisfactionRating: rating || satisfactionLevel || 5,
      notes: feedback || '',
      evidence: validatedEvidence,
      confirmedAt: new Date()
    };

    // Also maintain legacy victimFeedback for backward compatibility
    request.victimFeedback = {
      rating: rating || satisfactionLevel || 5,
      feedback: feedback || '',
      closurePhotos: validatedEvidence.photos.map(p => 
        typeof p === 'string' ? p : p.data
      ) || [],
      submittedAt: new Date()
    };

    request.timeline.push({
      action: 'closed',
      performedBy: req.userId,
      timestamp: new Date(),
      details: 'Victim confirmed completion' + (totalEvidenceCount ? ` with ${validatedEvidence.photos.length} photo(s), ${validatedEvidence.videos.length} video(s), ${validatedEvidence.voiceNotes.length} audio file(s)` : '')
    });
    
    try {
      console.log('📝 Before save - fulfillmentConfirmation:', {
        hasEvidence: !!request.fulfillmentConfirmation?.evidence,
        photos: request.fulfillmentConfirmation?.evidence?.photos?.length || 0,
        videos: request.fulfillmentConfirmation?.evidence?.videos?.length || 0,
        voiceNotes: request.fulfillmentConfirmation?.evidence?.voiceNotes?.length || 0
      });

      await request.save();
      
      console.log('✅ Request saved with status: closed and evidence:', totalEvidenceCount);
      console.log('📝 After save - fulfillmentConfirmation:', {
        hasEvidence: !!request.fulfillmentConfirmation?.evidence,
        photos: request.fulfillmentConfirmation?.evidence?.photos?.length || 0,
        videos: request.fulfillmentConfirmation?.evidence?.videos?.length || 0,
        voiceNotes: request.fulfillmentConfirmation?.evidence?.voiceNotes?.length || 0
      });
    } catch (saveError) {
      console.error('❌ Request save failed:', saveError.message);
      console.error('📋 Save error details:', saveError);
      throw new Error(`Failed to save request: ${saveError.message}`);
    }

    // Update all assignments to closed
    const assignments = await Assignment.find({ request: requestId });
    console.log('📋 Found assignments to close:', assignments.length);
    
    for (const assignment of assignments) {
      try {
        if (assignment.status !== 'closed') {
          assignment.status = 'closed';
          assignment.actualCompletion = new Date();
          assignment.timeline.push({
            status: 'closed',
            timestamp: new Date(),
            notes: 'Request closed by victim' + (validatedEvidence?.photos?.length > 0 || validatedEvidence?.videos?.length > 0 || validatedEvidence?.voiceNotes?.length > 0 ? ` (with ${validatedEvidence.photos.length} photo(s), ${validatedEvidence.videos.length} video(s), ${validatedEvidence.voiceNotes.length} audio file(s))` : '')
          });
          
          await assignment.save();
          console.log('✅ Assignment closed:', assignment._id);

          // Update NGO stats (non-blocking)
          try {
            const ngo = await NGO.findById(assignment.assignedTo);
            if (ngo) {
              if (!ngo.stats) ngo.stats = {};
              ngo.stats.completedAssignments = (ngo.stats.completedAssignments || 0) + 1;
              ngo.stats.rating = (rating || satisfactionLevel || 5);
              await ngo.save();
            }
          } catch (ngoErr) {
            console.warn('⚠️ Failed to update NGO stats:', ngoErr.message);
            // Don't fail the whole request for NGO stats
          }
        }
      } catch (assignErr) {
        console.error('❌ Assignment save failed:', assignErr.message);
        // Continue with other assignments, don't fail
        console.warn('⚠️ Continuing despite assignment error');
      }
    }
    console.log('✅ All assignments closed');

    // Audit log (non-blocking)
    try {
      await AuditLog.log({
        action: 'request_closed',
        performedBy: req.userId,
        performedByRole: req.userRole,
        targetType: 'Request',
        targetId: request._id,
        details: {
          previousStatus,
          newStatus: 'closed',
          feedback,
          rating: rating || satisfactionLevel || 5,
          photosCount: validatedEvidence?.photos?.length || 0,
          videosCount: validatedEvidence?.videos?.length || 0,
          audiosCount: validatedEvidence?.voiceNotes?.length || 0
        }
      });
      console.log('✅ Audit log created');
    } catch (auditErr) {
      console.warn('⚠️ Audit log failed (non-blocking):', auditErr.message);
    }

    // Emit Socket.IO events for real-time updates
    try {
      const io = getIO();
      
      // Notify all users in request room
      io.to(`request:${requestId}`).emit('request:status-changed', {
        requestId: request._id,
        status: 'closed',
        timestamp: new Date(),
        feedback,
        rating: rating || satisfactionLevel || 5,
        evidence: validatedEvidence
      });

      // Notify all assigned NGOs
      assignments.forEach(assignment => {
        io.to(`ngo:${assignment.assignedTo}`).emit('assignment:closed', {
          assignmentId: assignment._id,
          requestId: requestId,
          status: 'closed',
          rating: rating || satisfactionLevel || 5
        });
      });

      // Notify authorities/operators
      io.to('role:authority').to('role:operator').emit('request:completed', {
        requestId: request._id,
        status: 'closed',
        timestamp: new Date(),
        rating: rating || satisfactionLevel || 5,
        photosCount: validatedEvidence?.photos?.length || 0,
        videosCount: validatedEvidence?.videos?.length || 0,
        audiosCount: validatedEvidence?.voiceNotes?.length || 0
      });
      
      console.log('✅ Socket.IO events emitted');
    } catch (err) {
      console.warn('⚠️ Socket.IO emission failed:', err.message);
    }

    console.log('✅ closeRequest completed successfully');
    console.log('📤 Response data - evidence counts:', {
      photos: request.fulfillmentConfirmation?.evidence?.photos?.length || 0,
      videos: request.fulfillmentConfirmation?.evidence?.videos?.length || 0,
      voiceNotes: request.fulfillmentConfirmation?.evidence?.voiceNotes?.length || 0
    });
    return res.status(200).json({
      success: true,
      message: 'Request closed successfully',
      request,
      assignmentsClosed: assignments.length
    });
  } catch (error) {
    console.error('❌ closeRequest error:', error);
    console.error('❌ Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to close request',
      error: error.message
    });
  }
};

/**
 * Update request status to triaged (after initial assessment)
 */
export const triageRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { triageNotes, priority } = req.body;

    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    // Only authority/admin can triage
    if (!['authority', 'admin'].includes(req.userRole)) {
      return res.status(403).json({ success: false, message: "Only authority can triage" });
    }

    const previousStatus = request.status;
    
    // Transition only from new to triaged
    if (request.status !== 'new') {
      return res.status(400).json({ success: false, message: "Can only triage new requests" });
    }

    request.status = 'triaged';
    if (priority) request.priority = priority;
    request.timeline.push({
      action: 'triaged',
      performedBy: req.userId,
      details: triageNotes || 'Request triaged'
    });
    await request.save();

    await AuditLog.log({
      action: 'request_triaged',
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: 'Request',
      targetId: request._id,
      details: { triageNotes, priority }
    });

    // Emit Socket.IO events for real-time updates
    try {
      const io = getIO();
      
      // Notify request room
      io.to(`request:${requestId}`).emit('request:status-changed', {
        requestId: request._id,
        status: 'triaged',
        priority: request.priority,
        timestamp: new Date(),
        triageNotes
      });

      // Notify operators/authorities dashboard
      io.to('role:operator').to('role:authority').emit('request:triaged-event', {
        requestId: request._id,
        status: 'triaged',
        priority: request.priority,
        timestamp: new Date()
      });

      // Notify NGOs dashboard (request now ready for assignment)
      io.to('role:ngo').emit('request:ready-for-assignment', {
        requestId: request._id,
        priority: request.priority,
        location: request.location
      });
    } catch (err) {
      console.warn('Socket.IO emission failed:', err.message);
    }

    res.json({
      success: true,
      message: 'Request triaged successfully',
      request
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to triage request',
      error: error.message
    });
  }
};

/**
 * Update request status to in-progress (when NGO starts work)
 */
export const startRequest = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { startNotes } = req.body;

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    // Verify NGO is authorized
    if (assignment.assignedTo.toString() !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    const previousStatus = assignment.status;

    // Transition from accepted/arrived to in-progress
    if (!['accepted', 'arrived', 'en-route'].includes(assignment.status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot start from ${assignment.status} status` 
      });
    }

    assignment.status = 'in-progress';
    assignment.timeline.push({
      status: 'in-progress',
      timestamp: new Date(),
      notes: startNotes || 'NGO started work'
    });
    await assignment.save();

    // Update request status
    const request = await Request.findById(assignment.request);
    if (request && request.status !== 'in-progress') {
      request.status = 'in-progress';
      request.timeline.push({
        action: 'in-progress',
        performedBy: req.userId,
        details: 'Assignment started'
      });
      await request.save();
    }

    await AuditLog.log({
      action: 'assignment_started',
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: 'Assignment',
      targetId: assignment._id,
      details: { previousStatus, newStatus: 'in-progress' }
    });

    // Emit Socket.IO events for real-time updates
    try {
      const io = getIO();
      
      // Notify assignment room
      io.to(`assignment:${assignmentId}`).emit('assignment:status-changed', {
        assignmentId: assignment._id,
        status: 'in-progress',
        timestamp: new Date(),
        startNotes
      });

      // Notify request room
      io.to(`request:${assignment.request}`).emit('request:in-progress', {
        assignmentId: assignment._id,
        ngoId: assignment.assignedTo,
        timestamp: new Date()
      });

      // Notify authorities/operators dashboard
      io.to('role:authority').to('role:operator').emit('assignment:in-progress', {
        assignmentId: assignment._id,
        requestId: assignment.request,
        ngoId: assignment.assignedTo,
        timestamp: new Date()
      });
    } catch (err) {
      console.warn('Socket.IO emission failed:', err.message);
    }

    res.json({
      success: true,
      message: 'Assignment started',
      assignment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to start assignment',
      error: error.message
    });
  }
};

// ✅ Victim confirms fulfillment with evidence
export const confirmFulfillmentWithEvidence = async (req, res) => {
  try {
    const { requestId, evidence, notes, satisfaction } = req.body;
    const victimId = req.userId;

    console.log('✅ Victim fulfillment confirmation:', {
      requestId,
      victimId,
      evidenceTypes: evidence ? Object.keys(evidence) : [],
      hasPhotos: evidence?.photos?.length || 0,
      hasVideos: evidence?.videos?.length || 0,
      hasVoiceNotes: evidence?.voiceNotes?.length || 0,
    });

    // Find the request
    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    // Verify victim owns this request
    if (request.submittedBy.toString() !== victimId) {
      return res.status(403).json({ success: false, message: "Unauthorized: You can only confirm your own requests" });
    }

    // Add fulfillment confirmation evidence to request
    if (!request.fulfillmentConfirmation) {
      request.fulfillmentConfirmation = {};
    }

    request.fulfillmentConfirmation = {
      confirmedAt: new Date(),
      confirmedBy: victimId,
      notes: notes || '',
      satisfaction: satisfaction || 5,
      evidence: evidence || {
        photos: [],
        videos: [],
        voiceNotes: []
      }
    };

    // Mark request as fully fulfilled with victim confirmation
    request.status = 'fulfilled';
    request.fulfilledAt = new Date();
    
    await request.save();

    console.log('✅ Fulfillment confirmed by victim:', requestId);

    // Find related assignment to update
    const assignment = await Assignment.findOne({ 
      request: requestId,
      status: 'fulfilled'
    });

    if (assignment) {
      assignment.victimConfirmedAt = new Date();
      assignment.victimConfirmation = {
        confirmedAt: new Date(),
        satisfaction: satisfaction || 5,
        notes: notes || '',
        evidenceCount: {
          photos: evidence?.photos?.length || 0,
          videos: evidence?.videos?.length || 0,
          voiceNotes: evidence?.voiceNotes?.length || 0
        }
      };
      await assignment.save();
    }

    // Emit socket events for real-time updates
    try {
      const io = getIO();
      io.to(`request:${requestId}`).emit('fulfillment:victim-confirmed', {
        requestId,
        victimId,
        timestamp: new Date(),
        evidence: {
          photos: evidence?.photos?.length || 0,
          videos: evidence?.videos?.length || 0,
          voiceNotes: evidence?.voiceNotes?.length || 0
        }
      });

      // Notify authority dashboard
      io.to('role:authority').to('role:operator').emit('fulfillment:confirmed-with-evidence', {
        requestId,
        timestamp: new Date(),
        evidenceCount: {
          photos: evidence?.photos?.length || 0,
          videos: evidence?.videos?.length || 0,
          voiceNotes: evidence?.voiceNotes?.length || 0
        }
      });
    } catch (err) {
      console.warn('Socket.IO emission failed:', err.message);
    }

    res.json({
      success: true,
      message: 'Fulfillment confirmed with evidence',
      request: {
        id: request._id,
        status: request.status,
        fulfillmentConfirmation: request.fulfillmentConfirmation
      }
    });
  } catch (error) {
    console.error('❌ Fulfillment confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm fulfillment',
      error: error.message
    });
  }
};
