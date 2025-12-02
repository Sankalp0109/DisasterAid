import { Request } from '../models/Request.js';
import { Assignment } from '../models/Assignment.js';
import { NGO } from '../models/NGO.js';
import { User } from '../models/User.js';
import { Parser } from 'json2csv';

/**
 * Get comprehensive statistics for the dashboard
 */
export const getStats = async (req, res) => {
  try {
    // Get request statistics
    const totalRequests = await Request.countDocuments();
    const sosRequests = await Request.countDocuments({ sosDetected: true });
    const criticalRequests = await Request.countDocuments({ priority: 'critical' });
    
    // Get status breakdown
    const statusBreakdown = await Request.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Get priority breakdown
    const priorityBreakdown = await Request.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    // Get total beneficiaries
    const totalBeneficiaries = await Request.aggregate([
      { $group: { _id: null, total: { $sum: '$beneficiaries.total' } } }
    ]);

    // Get fulfilled requests
    const fulfilledRequests = await Request.countDocuments({ status: 'fulfilled' });

    // Get active clusters
    const activeClusters = await Request.distinct('clusterId');

    // Get NGO statistics
    const totalNGOs = await NGO.countDocuments();
    const verifiedNGOs = await NGO.countDocuments({ verified: true });
    const activeNGOs = await NGO.countDocuments({ status: 'active' });

    // Get assignment statistics
    const totalAssignments = await Assignment.countDocuments();
    const completedAssignments = await Assignment.countDocuments({ status: 'completed' });
    const inProgressAssignments = await Assignment.countDocuments({ status: 'in-progress' });
    const pendingAssignments = await Assignment.countDocuments({ status: 'pending' });

    // Calculate average response times (in hours)
    const responseMetrics = await Request.aggregate([
      {
        $match: { createdAt: { $exists: true } }
      },
      {
        $addFields: {
          createdTime: { $toDate: '$createdAt' },
          triageTime: {
            $cond: [
              { $and: [{ $ne: ['$triageAt', null] }, { $ne: ['$createdAt', null] }] },
              {
                $divide: [
                  { $subtract: [{ $toDate: '$triageAt' }, { $toDate: '$createdAt' }] },
                  3600000 // Convert to hours
                ]
              },
              null
            ]
          },
          assignmentTime: {
            $cond: [
              { $and: [{ $ne: ['$assignedAt', null] }, { $ne: ['$createdAt', null] }] },
              {
                $divide: [
                  { $subtract: [{ $toDate: '$assignedAt' }, { $toDate: '$createdAt' }] },
                  3600000
                ]
              },
              null
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgTriageTime: { $avg: '$triageTime' },
          avgAssignmentTime: { $avg: '$assignmentTime' },
          avgFulfillmentTime: { $avg: '$fulfillmentTime' }
        }
      }
    ]);

    // Build response
    const stats = {
      requests: {
        total: totalRequests,
        sos: sosRequests,
        critical: criticalRequests,
        fulfilled: fulfilledRequests,
        byStatus: statusBreakdown.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        byPriority: priorityBreakdown.reduce((acc, p) => ({ ...acc, [p._id]: p.count }), {})
      },
      beneficiaries: {
        total: totalBeneficiaries[0]?.total || 0
      },
      clusters: {
        active: activeClusters.length
      },
      ngos: {
        total: totalNGOs,
        verified: verifiedNGOs,
        active: activeNGOs
      },
      assignments: {
        total: totalAssignments,
        completed: completedAssignments,
        inProgress: inProgressAssignments,
        pending: pendingAssignments
      },
      metrics: {
        avgTriageTime: Math.round(responseMetrics[0]?.avgTriageTime || 0) / 10,
        avgAssignmentTime: Math.round(responseMetrics[0]?.avgAssignmentTime || 0) / 10,
        avgFulfillmentTime: Math.round(responseMetrics[0]?.avgFulfillmentTime || 0) / 10
      }
    };

    return res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};

/**
 * Export data in CSV or JSON format
 */
export const exportData = async (req, res) => {
  try {
    const { type } = req.params;
    const format = req.query.format || 'csv';
    const ticketNumber = req.query.ticketNumber; // Filter by ticket number
    const requestId = req.query.requestId; // Filter by request ID

    let data = [];
    let filename = '';

    if (type === 'requests') {
      // Build query filter
      let query = {};
      if (ticketNumber) {
        query.ticketNumber = ticketNumber;
      } else if (requestId) {
        query._id = requestId;
      }

      // Export all requests (or specific request) with complete lifecycle data
      const requests = await Request.find(query)
        .populate('submittedBy', 'name email phone')
        .populate({
          path: 'assignments',
          populate: {
            path: 'assignedTo',
            select: 'name email phone organization'
          }
        })
        .select('-__v')
        .lean();

      data = requests.map(r => {
        // Get all assigned NGOs
        const assignedNGOs = r.assignments && r.assignments.length > 0
          ? r.assignments.map(a => a.assignedTo?.name || a.assignedTo?.organization || 'Unknown').join(', ')
          : 'None';

        // Get assignment statuses
        const assignmentStatuses = r.assignments && r.assignments.length > 0
          ? r.assignments.map(a => `${a.assignedTo?.name || 'NGO'}: ${a.status}`).join('; ')
          : 'No assignments';

        // Calculate evidence counts properly
        const photoCount = r.evidence?.photos?.length || 0;
        const videoCount = r.evidence?.videos?.length || 0;
        const voiceNoteCount = r.evidence?.voiceNotes?.length || 0;
        const documentCount = r.evidence?.documents?.length || 0;
        const totalEvidenceCount = photoCount + videoCount + voiceNoteCount + documentCount;

        // Extract needs information
        const needsList = [];
        if (r.needs?.rescue?.required) needsList.push(`Rescue (${r.needs.rescue.urgency})`);
        if (r.needs?.food?.required) needsList.push(`Food (${r.needs.food.quantity || 'N/A'})`);
        if (r.needs?.water?.required) needsList.push(`Water (${r.needs.water.quantity || 'N/A'})`);
        if (r.needs?.medical?.required) needsList.push(`Medical (${r.needs.medical.urgency})`);
        if (r.needs?.shelter?.required) needsList.push('Shelter');
        if (r.needs?.transport?.required) needsList.push('Transport');
        if (r.needs?.babySupplies?.required) needsList.push('Baby Supplies');
        if (r.needs?.sanitation?.required) needsList.push('Sanitation');
        if (r.needs?.power?.required) needsList.push('Power');

        // Extract special needs
        const specialNeedsList = [];
        if (r.specialNeeds?.medicalConditions?.length > 0) {
          specialNeedsList.push(`Medical: ${r.specialNeeds.medicalConditions.join(', ')}`);
        }
        if (r.specialNeeds?.disabilities?.length > 0) {
          specialNeedsList.push(`Disabilities: ${r.specialNeeds.disabilities.join(', ')}`);
        }
        if (r.specialNeeds?.pregnant) specialNeedsList.push('Pregnant');
        if (r.specialNeeds?.pets?.has) {
          specialNeedsList.push(`Pets: ${r.specialNeeds.pets.count}`);
        }

        return {
          // Basic Information
          ticketNumber: r.ticketNumber || `REQ-${r._id.toString().slice(-8).toUpperCase()}`,
          currentStatus: r.status || 'new',
          priority: r.priority || 'medium',
          selfDeclaredUrgency: r.selfDeclaredUrgency || 'medium',
          sosDetected: r.sosDetected ? 'Yes' : 'No',
          
          // Requester Information
          submittedBy: r.submittedBy?.name || 'Unknown',
          requesterEmail: r.submittedBy?.email || r.submitterContact?.email || '',
          requesterPhone: r.submittedBy?.phone || r.submitterContact?.phone || '',
          requesterCountryCode: r.submitterContact?.countryCode || '+91',
          alternatePhone: r.submitterContact?.alternateContact || '',
          alternateCountryCode: r.submitterContact?.alternateCountryCode || '+91',
          
          // Request Type & Description
          requestType: r.requestType || 'individual',
          description: r.description || '',
          
          // Beneficiaries
          beneficiariesTotal: r.beneficiaries?.total || 0,
          adults: r.beneficiaries?.adults || 0,
          children: r.beneficiaries?.children || 0,
          elderly: r.beneficiaries?.elderly || 0,
          infants: r.beneficiaries?.infants || 0,
          
          // Location Details
          locationAddress: r.location?.address || '',
          landmark: r.location?.landmark || '',
          area: r.location?.area || '',
          city: r.location?.city || '',
          state: r.location?.state || '',
          pincode: r.location?.pincode || '',
          latitude: r.location?.coordinates?.[1] || '',
          longitude: r.location?.coordinates?.[0] || '',
          locationAccuracy: r.location?.accuracy || '',
          
          // Needs & Requirements
          needsRequired: needsList.join('; ') || 'None specified',
          rescueRequired: r.needs?.rescue?.required ? 'Yes' : 'No',
          rescueUrgency: r.needs?.rescue?.urgency || '',
          rescueDetails: r.needs?.rescue?.details || '',
          foodRequired: r.needs?.food?.required ? 'Yes' : 'No',
          foodQuantity: r.needs?.food?.quantity || '',
          waterRequired: r.needs?.water?.required ? 'Yes' : 'No',
          waterQuantity: r.needs?.water?.quantity || '',
          medicalRequired: r.needs?.medical?.required ? 'Yes' : 'No',
          medicalUrgency: r.needs?.medical?.urgency || '',
          medicalDetails: r.needs?.medical?.details || '',
          shelterRequired: r.needs?.shelter?.required ? 'Yes' : 'No',
          transportRequired: r.needs?.transport?.required ? 'Yes' : 'No',
          
          // Special Needs
          specialNeeds: specialNeedsList.join('; ') || 'None',
          medicalConditions: r.specialNeeds?.medicalConditions?.join(', ') || '',
          disabilities: r.specialNeeds?.disabilities?.join(', ') || '',
          pregnant: r.specialNeeds?.pregnant ? 'Yes' : 'No',
          hasPets: r.specialNeeds?.pets?.has ? 'Yes' : 'No',
          petCount: r.specialNeeds?.pets?.count || 0,
          
          // Device Information
          batteryLevel: r.deviceInfo?.batteryLevel || '',
          signalStrength: r.deviceInfo?.signalStrength || '',
          networkType: r.deviceInfo?.networkType || '',
          
          // SOS Indicators
          trapped: r.sosIndicators?.trapped ? 'Yes' : 'No',
          medicalEmergency: r.sosIndicators?.medicalEmergency ? 'Yes' : 'No',
          repeatedCalls: r.sosIndicators?.repeatedCalls || 0,
          lowBattery: r.sosIndicators?.lowBattery ? 'Yes' : 'No',
          poorSignal: r.sosIndicators?.poorSignal ? 'Yes' : 'No',
          sosKeywords: r.sosIndicators?.keywords?.join(', ') || '',
          
          // Assignment Information
          assignedNGOs: assignedNGOs,
          assignmentCount: r.assignments?.length || 0,
          assignmentStatuses: assignmentStatuses,
          
          // Evidence
          totalEvidenceCount: totalEvidenceCount,
          photoCount: photoCount,
          videoCount: videoCount,
          voiceNoteCount: voiceNoteCount,
          documentCount: documentCount,
          
          // Lifecycle Timestamps
          requestCreated: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
          lastUpdated: r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '',
          triagedAt: r.triagedAt ? new Date(r.triagedAt).toLocaleString() : '',
          fulfilledAt: r.fulfilledAt ? new Date(r.fulfilledAt).toLocaleString() : '',
          closedAt: r.closedAt ? new Date(r.closedAt).toLocaleString() : '',
          
          // Triage Information
          triageNotes: r.triageNotes || '',
          triagedByName: r.triagedBy?.name || '',
          
          // Operator Notes
          operatorNotes: r.operatorNotes || '',
          
          // Priority Change
          priorityChangedAt: r.priorityChangedAt ? new Date(r.priorityChangedAt).toLocaleString() : '',
          
          // Duplicate Information
          isDuplicate: r.isDuplicate ? 'Yes' : 'No',
          duplicateScore: r.duplicateScore || '',
          
          // Escalation Information
          isEscalated: r.isEscalated ? 'Yes' : 'No',
          escalationReason: r.escalationReason || '',
          escalatedAt: r.escalatedAt ? new Date(r.escalatedAt).toLocaleString() : '',
          
          // Match Confirmation
          matchConfirmed: r.matchConfirmed ? 'Yes' : 'No',
          matchConfirmedAt: r.matchConfirmedAt ? new Date(r.matchConfirmedAt).toLocaleString() : '',
          
          // Feedback
          victimRating: r.victimFeedback?.rating || '',
          victimFeedback: r.victimFeedback?.feedback || '',
          victimFeedbackSubmittedAt: r.victimFeedback?.submittedAt ? new Date(r.victimFeedback.submittedAt).toLocaleString() : '',
          
          // Fulfillment Confirmation
          fulfillmentConfirmed: r.fulfillmentConfirmation?.confirmedAt ? 'Yes' : 'No',
          fulfillmentConfirmedAt: r.fulfillmentConfirmation?.confirmedAt ? new Date(r.fulfillmentConfirmation.confirmedAt).toLocaleString() : '',
          fulfillmentSatisfaction: r.fulfillmentConfirmation?.satisfaction || '',
          fulfillmentNotes: r.fulfillmentConfirmation?.notes || ''
        };
      });

      filename = 'requests';
    } else if (type === 'assignments') {
      // Export all assignments with complete details
      const assignments = await Assignment.find()
        .populate({
          path: 'request',
          select: 'ticketNumber status priority description location beneficiaries submittedBy',
          populate: {
            path: 'submittedBy',
            select: 'name email phone'
          }
        })
        .populate('assignedTo', 'name email phone organization region')
        .populate('offer', 'title category quantity')
        .select('-__v')
        .lean();

      data = assignments.map(a => ({
        assignmentId: a._id.toString().slice(-6),
        
        // Request Information
        requestTicket: a.request?.ticketNumber || 'N/A',
        requestStatus: a.request?.status || '',
        requestPriority: a.request?.priority || '',
        requestDescription: a.request?.description || '',
        
        // Requester Information
        requesterName: a.request?.submittedBy?.name || 'Unknown',
        requesterEmail: a.request?.submittedBy?.email || '',
        requesterPhone: a.request?.submittedBy?.phone || '',
        
        // Assignment Details
        category: a.category || '',
        assignmentStatus: a.status,
        assignmentPriority: a.priority || '',
        
        // NGO Information
        ngoName: a.assignedTo?.name || a.assignedTo?.organization || 'Unknown',
        ngoEmail: a.assignedTo?.email || '',
        ngoPhone: a.assignedTo?.phone || '',
        ngoRegion: a.assignedTo?.region || '',
        
        // Offer Details
        offerTitle: a.offer?.title || 'N/A',
        offerCategory: a.offer?.category || '',
        offerQuantity: a.offer?.quantity || '',
        
        // Location
        location: a.request?.location?.address || '',
        beneficiaries: a.request?.beneficiaries?.total || 0,
        
        // Delivery Information
        deliveryMarked: a.deliveryMarked ? 'Yes' : 'No',
        deliveryAcknowledged: a.deliveryAcknowledged ? 'Yes' : 'No',
        deliveryNotes: a.deliveryNotes || '',
        
        // Timestamps
        assignedDate: a.createdAt ? new Date(a.createdAt).toLocaleString() : '',
        lastUpdated: a.updatedAt ? new Date(a.updatedAt).toLocaleString() : '',
        acceptedDate: a.acceptedAt ? new Date(a.acceptedAt).toLocaleString() : '',
        completedDate: a.completedAt ? new Date(a.completedAt).toLocaleString() : '',
        deliveryMarkedDate: a.deliveryMarkedAt ? new Date(a.deliveryMarkedAt).toLocaleString() : '',
        deliveryAcknowledgedDate: a.deliveryAcknowledgedAt ? new Date(a.deliveryAcknowledgedAt).toLocaleString() : ''
      }));

      filename = 'assignments';
    } else if (type === 'ngos') {
      // Export all NGOs
      const ngos = await NGO.find()
        .select('-__v -password')
        .lean();

      data = ngos.map(n => ({
        name: n.name,
        email: n.email,
        phone: n.phone,
        verified: n.verified ? 'Yes' : 'No',
        status: n.status,
        region: n.region,
        coverageRadius: `${(n.coverageRadius || 50000) / 1000}km`,
        activeAssignments: n.activeAssignments || 0,
        completedAssignments: n.completedAssignments || 0
      }));

      filename = 'ngos';
    } else if (type === 'analytics') {
      // Export analytics summary
      const stats = await getStatsData();
      data = [stats];
      filename = 'analytics-summary';
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}-${Date.now()}.json"`);
      return res.json(data);
    } else {
      // CSV format (default)
      if (data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No data to export'
        });
      }

      const csv = new Parser({ fields: Object.keys(data[0]) }).parse(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}-${Date.now()}.csv"`);
      return res.send(csv);
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    return res.status(500).json({
      success: false,
      message: 'Error exporting data',
      error: error.message
    });
  }
};

/**
 * Helper function to get stats data
 */
async function getStatsData() {
  const totalRequests = await Request.countDocuments();
  const sosRequests = await Request.countDocuments({ sosDetected: true });
  const fulfilledRequests = await Request.countDocuments({ status: 'fulfilled' });
  const totalBeneficiaries = await Request.aggregate([
    { $group: { _id: null, total: { $sum: '$beneficiaries.total' } } }
  ]);
  const totalNGOs = await NGO.countDocuments();
  const totalAssignments = await Assignment.countDocuments();
  const completedAssignments = await Assignment.countDocuments({ status: 'completed' });

  return {
    timestamp: new Date().toLocaleString(),
    totalRequests,
    sosRequests,
    fulfilledRequests,
    totalBeneficiaries: totalBeneficiaries[0]?.total || 0,
    totalNGOs,
    totalAssignments,
    completedAssignments,
    fulfillmentRate: totalRequests > 0 ? ((fulfilledRequests / totalRequests) * 100).toFixed(2) + '%' : '0%'
  };
}
