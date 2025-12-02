import { Request } from "../models/Request.js";
import { User } from "../models/User.js";
import mongoose from "mongoose";

/**
 * DUPLICATE DETECTION ALGORITHM
 * Detects potential duplicate requests based on:
 * 1. Location proximity (within 500m)
 * 2. Temporal proximity (within 24 hours)
 * 3. Similarity in needs/description
 */

// Helper: Calculate text similarity using Jaccard coefficient
const calculateTextSimilarity = (text1, text2) => {
  if (!text1 || !text2) return 0;
  
  const normalize = (str) => 
    str.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);
  
  const set1 = new Set(normalize(text1));
  const set2 = new Set(normalize(text2));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
};

// Helper: Calculate needs similarity
const calculateNeedsSimilarity = (needs1, needs2) => {
  const needTypes = ['rescue', 'food', 'water', 'medical', 'shelter', 'transport', 'babySupplies', 'sanitation', 'power'];
  let matchCount = 0;
  let totalCount = 0;
  
  needTypes.forEach(need => {
    const has1 = needs1?.[need]?.required || false;
    const has2 = needs2?.[need]?.required || false;
    
    if (has1 || has2) {
      totalCount++;
      if (has1 === has2) matchCount++;
    }
  });
  
  return totalCount === 0 ? 0 : matchCount / totalCount;
};

// Helper: Calculate duplicate score
const calculateDuplicateScore = (req1, req2, distance) => {
  // Location proximity score (closer = higher score)
  const locationScore = Math.max(0, 1 - (distance / 500));
  
  // Time proximity score (within 24 hours = 1, decreases after)
  const timeDiff = Math.abs(new Date(req1.createdAt) - new Date(req2.createdAt));
  const hoursDiff = timeDiff / (1000 * 60 * 60);
  const timeScore = Math.max(0, 1 - (hoursDiff / 24));
  
  // Text similarity
  const desc1 = req1.description || '';
  const desc2 = req2.description || '';
  const textScore = calculateTextSimilarity(desc1, desc2);
  
  // Needs similarity
  const needsScore = calculateNeedsSimilarity(req1.needs, req2.needs);
  
  // Beneficiary similarity
  const ben1 = req1.beneficiaries?.total || 0;
  const ben2 = req2.beneficiaries?.total || 0;
  const benScore = ben1 === 0 || ben2 === 0 ? 0.5 : 
    1 - Math.abs(ben1 - ben2) / Math.max(ben1, ben2);
  
  // Weighted average
  const weights = {
    location: 0.35,
    time: 0.20,
    text: 0.15,
    needs: 0.20,
    beneficiaries: 0.10
  };
  
  return (
    locationScore * weights.location +
    timeScore * weights.time +
    textScore * weights.text +
    needsScore * weights.needs +
    benScore * weights.beneficiaries
  );
};

/**
 * GET /api/operator/duplicates
 * Get potential duplicate requests
 */
export const getDuplicates = async (req, res) => {
  try {
    const threshold = parseFloat(req.query.threshold) || 0.7; // Similarity threshold
    const maxDistance = parseInt(req.query.maxDistance) || 500; // meters
    
    // Get unresolved, non-duplicate requests
    const requests = await Request.find({
      isDuplicate: false,
      mergedInto: null,
      status: { $in: ['new', 'triaged', 'assigned'] }
    })
    .populate('submittedBy', 'name countryCode phone email')
    .sort({ createdAt: -1 })
    .limit(200); // Process recent requests only
    
    const duplicatePairs = [];
    const processedIds = new Set();
    
    // Find potential duplicates
    for (let i = 0; i < requests.length; i++) {
      const req1 = requests[i];
      if (processedIds.has(req1._id.toString())) continue;
      
      // Find nearby requests using geospatial query
      const nearbyRequests = await Request.find({
        _id: { $ne: req1._id, $nin: Array.from(processedIds) },
        isDuplicate: false,
        mergedInto: null,
        status: { $in: ['new', 'triaged', 'assigned'] },
        'location.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: req1.location.coordinates
            },
            $maxDistance: maxDistance
          }
        }
      })
      .populate('submittedBy', 'name countryCode phone email')
      .limit(10);
      
      // Calculate similarity scores
      for (const req2 of nearbyRequests) {
        if (processedIds.has(req2._id.toString())) continue;
        
        // Calculate distance
        const [lon1, lat1] = req1.location.coordinates;
        const [lon2, lat2] = req2.location.coordinates;
        const distance = calculateDistance(lat1, lon1, lat2, lon2);
        
        // Calculate duplicate score
        const score = calculateDuplicateScore(req1, req2, distance);
        
        if (score >= threshold) {
          duplicatePairs.push({
            score: Math.round(score * 100),
            distance: Math.round(distance),
            request1: {
              _id: req1._id,
              ticketNumber: req1.ticketNumber,
              location: req1.location,
              description: req1.description,
              needs: req1.needs,
              beneficiaries: req1.beneficiaries,
              priority: req1.priority,
              status: req1.status,
              submittedBy: req1.submittedBy,
              createdAt: req1.createdAt,
              sosDetected: req1.sosDetected
            },
            request2: {
              _id: req2._id,
              ticketNumber: req2.ticketNumber,
              location: req2.location,
              description: req2.description,
              needs: req2.needs,
              beneficiaries: req2.beneficiaries,
              priority: req2.priority,
              status: req2.status,
              submittedBy: req2.submittedBy,
              createdAt: req2.createdAt,
              sosDetected: req2.sosDetected
            }
          });
        }
      }
    }
    
    // Sort by score descending
    duplicatePairs.sort((a, b) => b.score - a.score);
    
    res.json({
      success: true,
      count: duplicatePairs.length,
      duplicates: duplicatePairs.slice(0, 50) // Return top 50
    });
  } catch (error) {
    console.error('Error fetching duplicates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch duplicates',
      error: error.message
    });
  }
};

// Helper: Calculate distance between two points (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
};

/**
 * POST /api/operator/duplicates/resolve
 * Resolve duplicate requests (merge or mark as not duplicate)
 */
export const resolveDuplicate = async (req, res) => {
  try {
    const { request1Id, request2Id, action, keepId, notes } = req.body;
    
    if (!request1Id || !request2Id || !action) {
      return res.status(400).json({
        success: false,
        message: 'request1Id, request2Id, and action are required'
      });
    }
    
    const request1 = await Request.findById(request1Id);
    const request2 = await Request.findById(request2Id);
    
    if (!request1 || !request2) {
      return res.status(404).json({
        success: false,
        message: 'One or both requests not found'
      });
    }
    
    const operatorId = req.user._id;
    const io = req.app.get('io');
    
    if (action === 'merge') {
      if (!keepId) {
        return res.status(400).json({
          success: false,
          message: 'keepId is required for merge action'
        });
      }
      
      const keepRequest = keepId === request1Id ? request1 : request2;
      const discardRequest = keepId === request1Id ? request2 : request1;
      
      // Mark discarded request as duplicate
      discardRequest.isDuplicate = true;
      discardRequest.mergedInto = keepRequest._id;
      discardRequest.duplicateResolvedBy = operatorId;
      discardRequest.duplicateResolvedAt = new Date();
      discardRequest.status = 'closed';
      
      // Add note to timeline
      discardRequest.timeline.push({
        action: 'Marked as duplicate',
        performedBy: operatorId,
        timestamp: new Date(),
        details: `Merged into request #${keepRequest.ticketNumber}. ${notes || ''}`
      });
      
      keepRequest.timeline.push({
        action: 'Duplicate merged',
        performedBy: operatorId,
        timestamp: new Date(),
        details: `Request #${discardRequest.ticketNumber} marked as duplicate and merged. ${notes || ''}`
      });
      
      await discardRequest.save();
      await keepRequest.save();
      
      // Emit real-time event
      io.to('role:operator').to('role:authority').emit('duplicate:resolved', {
        action: 'merge',
        keptRequest: keepRequest._id,
        discardedRequest: discardRequest._id
      });
      
      res.json({
        success: true,
        message: 'Requests merged successfully',
        keptRequest: keepRequest._id,
        discardedRequest: discardRequest._id
      });
      
    } else if (action === 'not-duplicate') {
      // Add notes to both requests indicating they were reviewed
      const note = `Reviewed and confirmed NOT a duplicate of request #${request2.ticketNumber}. ${notes || ''}`;
      
      request1.timeline.push({
        action: 'Duplicate review',
        performedBy: operatorId,
        timestamp: new Date(),
        details: note
      });
      
      request2.timeline.push({
        action: 'Duplicate review',
        performedBy: operatorId,
        timestamp: new Date(),
        details: `Reviewed and confirmed NOT a duplicate of request #${request1.ticketNumber}. ${notes || ''}`
      });
      
      await request1.save();
      await request2.save();
      
      res.json({
        success: true,
        message: 'Marked as not duplicate'
      });
      
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "merge" or "not-duplicate"'
      });
    }
  } catch (error) {
    console.error('Error resolving duplicate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve duplicate',
      error: error.message
    });
  }
};

/**
 * GET /api/operator/matches
 * Get suggested request-NGO matches for confirmation
 */
export const getMatches = async (req, res) => {
  try {
    const minScore = parseFloat(req.query.minScore) || 0.6;
    
    // Get requests needing assignment
    const requests = await Request.find({
      status: { $in: ['triaged', 'new'] },
      assignments: { $size: 0 },
      suggestedMatches: { $exists: true, $ne: [] }
    })
    .populate('submittedBy', 'name countryCode phone email')
    .populate('suggestedMatches.ngo', 'name email countryCode phone city serviceAreas resources')
    .sort({ priority: -1, createdAt: 1 })
    .limit(50);
    
    // Filter by minimum score and format
    const matches = requests.map(request => ({
      _id: request._id,
      ticketNumber: request.ticketNumber,
      location: request.location,
      description: request.description,
      needs: request.needs,
      beneficiaries: request.beneficiaries,
      priority: request.priority,
      status: request.status,
      sosDetected: request.sosDetected,
      submittedBy: request.submittedBy,
      createdAt: request.createdAt,
      suggestedMatches: request.suggestedMatches
        .filter(match => match.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5) // Top 5 matches per request
    })).filter(req => req.suggestedMatches.length > 0);
    
    res.json({
      success: true,
      count: matches.length,
      matches
    });
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch matches',
      error: error.message
    });
  }
};

/**
 * POST /api/operator/matches/confirm
 * Confirm a request-NGO match and create assignment
 */
export const confirmMatch = async (req, res) => {
  try {
    const { requestId, ngoId, notes } = req.body;
    
    if (!requestId || !ngoId) {
      return res.status(400).json({
        success: false,
        message: 'requestId and ngoId are required'
      });
    }
    
    const request = await Request.findById(requestId);
    const ngo = await User.findOne({ _id: ngoId, role: 'ngo' });
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }
    
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }
    
    // Check if already assigned
    if (request.assignments && request.assignments.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Request already has assignments'
      });
    }
    
    // Mark match as confirmed
    request.matchConfirmed = true;
    request.matchConfirmedBy = req.user._id;
    request.matchConfirmedAt = new Date();
    
    // Add to timeline
    request.timeline.push({
      action: 'Match confirmed',
      performedBy: req.user._id,
      timestamp: new Date(),
      details: `Confirmed match with ${ngo.name}. ${notes || ''}`
    });
    
    await request.save();
    
    // Create assignment (using existing assignment creation logic)
    const Assignment = mongoose.model('Assignment');
    const assignment = new Assignment({
      request: request._id,
      ngo: ngo._id,
      assignedBy: req.user._id,
      status: 'pending',
      notes: notes || `Match confirmed by operator`,
      timeline: [{
        action: 'Assignment created from confirmed match',
        performedBy: req.user._id,
        timestamp: new Date()
      }]
    });
    
    await assignment.save();
    
    // Update request
    request.assignments.push(assignment._id);
    request.status = 'assigned';
    await request.save();
    
    // Emit real-time events
    const io = req.app.get('io');
    io.to('role:operator').to('role:authority').emit('match:confirmed', {
      requestId: request._id,
      ngoId: ngo._id,
      assignmentId: assignment._id
    });
    
    io.to(`user:${ngo._id}`).emit('assignment:new', {
      assignment: assignment._id,
      request: request._id
    });
    
    res.json({
      success: true,
      message: 'Match confirmed and assignment created',
      assignmentId: assignment._id
    });
  } catch (error) {
    console.error('Error confirming match:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm match',
      error: error.message
    });
  }
};

/**
 * GET /api/operator/escalations
 * Get escalated requests needing operator attention
 */
export const getEscalations = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    
    const escalations = await Request.find({
      isEscalated: true,
      escalationStatus: status
    })
    .populate('submittedBy', 'name email countryCode phone')
    .populate('escalatedBy', 'name role')
    .populate('assignments')
    .populate({
      path: 'assignments',
      populate: {
        path: 'ngo',
        select: 'name email countryCode phone'
      }
    })
    .sort({ escalatedAt: -1 })
    .limit(100);
    
    res.json({
      success: true,
      count: escalations.length,
      escalations
    });
  } catch (error) {
    console.error('Error fetching escalations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch escalations',
      error: error.message
    });
  }
};

/**
 * POST /api/operator/escalations/:id/handle
 * Handle an escalated request
 */
export const handleEscalation = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes, newPriority, forwardToAuthority } = req.body;
    
    if (!action) {
      return res.status(400).json({
        success: false,
        message: 'action is required'
      });
    }
    
    const request = await Request.findById(id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }
    
    if (!request.isEscalated) {
      return res.status(400).json({
        success: false,
        message: 'Request is not escalated'
      });
    }
    
    const operatorId = req.user._id;
    const io = req.app.get('io');
    
    switch (action) {
      case 'resolve':
        request.escalationStatus = 'resolved';
        request.escalationResolvedBy = operatorId;
        request.escalationResolvedAt = new Date();
        request.escalationNotes = notes || '';
        
        request.timeline.push({
          action: 'Escalation resolved',
          performedBy: operatorId,
          timestamp: new Date(),
          details: notes || 'Escalation resolved by operator'
        });
        
        break;
        
      case 'increase-priority':
        if (newPriority) {
          const oldPriority = request.priority;
          request.priority = newPriority;
          request.escalationStatus = 'under-review';
          
          request.timeline.push({
            action: 'Priority increased (escalation)',
            performedBy: operatorId,
            timestamp: new Date(),
            details: `Priority changed from ${oldPriority} to ${newPriority}. ${notes || ''}`
          });
        }
        
        break;
        
      case 'forward-to-authority':
        request.escalationStatus = 'forwarded';
        
        request.timeline.push({
          action: 'Escalation forwarded to authority',
          performedBy: operatorId,
          timestamp: new Date(),
          details: notes || 'Forwarded to authority for review'
        });
        
        // Notify authorities
        io.to('role:authority').emit('escalation:forwarded', {
          requestId: request._id,
          ticketNumber: request.ticketNumber,
          reason: request.escalationReason
        });
        
        break;
        
      case 'reassign':
        request.escalationStatus = 'under-review';
        
        request.timeline.push({
          action: 'Reassignment initiated (escalation)',
          performedBy: operatorId,
          timestamp: new Date(),
          details: notes || 'Request flagged for reassignment'
        });
        
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action'
        });
    }
    
    await request.save();
    
    // Emit real-time event
    io.to('role:operator').to('role:authority').emit('escalation:handled', {
      requestId: request._id,
      action,
      status: request.escalationStatus
    });
    
    res.json({
      success: true,
      message: 'Escalation handled successfully',
      request: {
        _id: request._id,
        escalationStatus: request.escalationStatus,
        priority: request.priority
      }
    });
  } catch (error) {
    console.error('Error handling escalation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to handle escalation',
      error: error.message
    });
  }
};

/**
 * POST /api/operator/escalations/create
 * Create escalation (for testing/manual escalation)
 */
export const createEscalation = async (req, res) => {
  try {
    const { requestId, reason } = req.body;
    
    if (!requestId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'requestId and reason are required'
      });
    }
    
    const request = await Request.findById(requestId);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }
    
    request.isEscalated = true;
    request.escalationReason = reason;
    request.escalatedBy = req.user._id;
    request.escalatedAt = new Date();
    request.escalationStatus = 'pending';
    
    request.timeline.push({
      action: 'Request escalated',
      performedBy: req.user._id,
      timestamp: new Date(),
      details: reason
    });
    
    await request.save();
    
    // Emit real-time event
    const io = req.app.get('io');
    io.to('role:operator').to('role:authority').emit('escalation:created', {
      requestId: request._id,
      ticketNumber: request.ticketNumber,
      reason
    });
    
    res.json({
      success: true,
      message: 'Request escalated successfully',
      escalation: {
        requestId: request._id,
        reason,
        status: request.escalationStatus
      }
    });
  } catch (error) {
    console.error('Error creating escalation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create escalation',
      error: error.message
    });
  }
};
