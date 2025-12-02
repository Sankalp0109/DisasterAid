import express from 'express';
import emailService from '../services/emailService.js';
import calendarService from '../services/calendarService.js';
import webhookService from '../services/webhookService.js';
import smsService from '../services/smsService.js';
import { Request } from '../models/Request.js';
import { Assignment } from '../models/Assignment.js';
import { User } from '../models/User.js';
import { NGO } from '../models/NGO.js';
import { Webhook } from '../models/Webhook.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// ============================================
// EMAIL ROUTES
// ============================================

/**
 * Test email service
 * GET /api/integrations/email/test
 */
router.get('/email/test', authenticate, async (req, res) => {
  try {
    const result = await emailService.testEmailService();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Send test email
 * POST /api/integrations/email/send-test
 */
router.post('/email/send-test', authenticate, async (req, res) => {
  try {
    const { email, subject } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email required' });
    }

    const result = await emailService.sendCriticalAlert(email, subject || 'Test Alert', {
      'Test Message': 'This is a test alert from Disaster Aid',
      'Sent At': new Date().toLocaleString(),
      'System': 'Disaster Aid Integration Test'
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Send critical alert
 * POST /api/integrations/email/critical-alert
 */
router.post('/email/critical-alert', authenticate, async (req, res) => {
  try {
    const { email, subject, details } = req.body;

    if (!email || !subject) {
      return res.status(400).json({ success: false, error: 'Email and subject required' });
    }

    const result = await emailService.sendCriticalAlert(email, subject, details);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CALENDAR / iCAL ROUTES
// ============================================

/**
 * Export NGO schedule as iCal
 * GET /api/integrations/calendar/ngo/:ngoId
 */
router.get('/calendar/ngo/:ngoId', authenticate, async (req, res) => {
  try {
    const assignments = await Assignment.find({
      assignedTo: req.params.ngoId
    })
      .populate('request')
      .populate('assignedTo');

    const ical = calendarService.generateNGOSchedule(assignments);

    res.set('Content-Type', 'text/calendar');
    res.set('Content-Disposition', 'attachment; filename="ngo-schedule.ics"');
    res.send(ical);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Export authority operations as iCal
 * GET /api/integrations/calendar/authority
 */
router.get('/calendar/authority', authenticate, async (req, res) => {
  try {
    const assignments = await Assignment.find()
      .populate('request')
      .populate('assignedTo');

    const ical = calendarService.generateAuthoritySchedule(assignments);

    res.set('Content-Type', 'text/calendar');
    res.set('Content-Disposition', 'attachment; filename="authority-operations.ics"');
    res.send(ical);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Export team schedule as iCal
 * GET /api/integrations/calendar/team/:teamId
 */
router.get('/calendar/team/:teamId', authenticate, async (req, res) => {
  try {
    const team = await NGO.findById(req.params.teamId);

    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    const assignments = await Assignment.find({
      assignedTo: req.params.teamId
    })
      .populate('request')
      .populate('assignedTo');

    const ical = calendarService.generateTeamSchedule(team, assignments);

    res.set('Content-Type', 'text/calendar');
    res.set('Content-Disposition', `attachment; filename="${team.name}-schedule.ics"`);
    res.send(ical);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// WEBHOOK ROUTES
// ============================================

/**
 * Create webhook
 * POST /api/integrations/webhooks
 */
router.post('/webhooks', authenticate, async (req, res) => {
  try {
    const { url, event, secret, description } = req.body;

    if (!url || !event) {
      return res.status(400).json({ success: false, error: 'URL and event required' });
    }

    const result = await webhookService.createWebhook(url, event, secret, req.userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get user webhooks
 * GET /api/integrations/webhooks
 */
router.get('/webhooks', authenticate, async (req, res) => {
  try {
    const result = await webhookService.getUserWebhooks(req.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update webhook
 * PUT /api/integrations/webhooks/:webhookId
 */
router.put('/webhooks/:webhookId', authenticate, async (req, res) => {
  try {
    const result = await webhookService.updateWebhook(req.params.webhookId, req.body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Test webhook
 * POST /api/integrations/webhooks/:webhookId/test
 */
router.post('/webhooks/:webhookId/test', authenticate, async (req, res) => {
  try {
    const webhook = await Webhook.findById(req.params.webhookId);

    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    const result = await webhookService.testWebhook(webhook);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete webhook
 * DELETE /api/integrations/webhooks/:webhookId
 */
router.delete('/webhooks/:webhookId', authenticate, async (req, res) => {
  try {
    const result = await webhookService.deleteWebhook(req.params.webhookId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SMS ROUTES
// ============================================

/**
 * Send SMS
 * POST /api/integrations/sms/send
 * Body: { phoneNumber, message } OR { assignmentId, message }
 */
router.post('/sms/send', authenticate, async (req, res) => {
  try {
    let { phoneNumber, countryCode, message, assignmentId } = req.body;

    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message required' 
      });
    }

    // If assignmentId provided, fetch phone from assignment's request
    if (assignmentId && !phoneNumber) {
      console.log(`📱 Fetching phone for assignment: ${assignmentId}`);
      const assignment = await Assignment.findById(assignmentId)
        .populate('request');

      if (!assignment || !assignment.request) {
        return res.status(404).json({ 
          success: false, 
          error: 'Assignment or request not found' 
        });
      }

      // ✅ Extract phone and country code (stored separately)
      const req_data = assignment.request;
      phoneNumber = req_data.submitterContact?.phone;
      countryCode = req_data.submitterContact?.countryCode || '+91';
      
      console.log(`✅ Extracted from request:`);
      console.log(`   - Phone (digits only): ${phoneNumber}`);
      console.log(`   - Country Code: ${countryCode}`);
    }

    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number required (either in request or valid assignment)' 
      });
    }

    // ✅ Build E.164 format for Twilio using separated CC and phone
    if (!countryCode) {
      countryCode = '+91'; // Default if not provided
    }
    
    const cc = countryCode.replace('+', ''); // Remove + if present: "91"
    const digitsOnly = phoneNumber.replace(/\D/g, ''); // Ensure digits only: "8639127753"
    const e164Phone = `+${cc}${digitsOnly}`; // Build: "+918639127753"
    
    console.log(`📝 Built E.164 format: ${e164Phone}`);
    console.log(`   - Country Code: ${countryCode}`);
    console.log(`   - Phone (digits): ${phoneNumber}`);
    console.log(`📱 Sending SMS to: ${e164Phone}`);
    
    const result = await smsService.sendSMS(e164Phone, message);
    
    // ✅ Return BOTH countryCode and phoneNumber separately to frontend
    res.json({
      ...result,
      countryCode,
      phoneNumber,
      e164Phone
    });
  } catch (error) {
    console.error('❌ Send SMS error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Send SMS to request recipient
 * POST /api/integrations/sms/send-to-request
 */
router.post('/sms/send-to-request', authenticate, async (req, res) => {
  try {
    const { requestId, message } = req.body;

    if (!requestId || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Request ID and message required' 
      });
    }

    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    // ✅ Extract phone (digits only) and country code (stored separately)
    const victimPhone = request.submitterContact?.phone;
    const victimCC = request.submitterContact?.countryCode || '+91';
    
    console.log(`📝 Phone extraction from request ${requestId}:`);
    console.log(`   - Phone (digits): ${victimPhone}`);
    console.log(`   - Country Code: ${victimCC}`);

    if (!victimPhone) {
      return res.status(400).json({ 
        success: false, 
        error: 'No phone number found for this request' 
      });
    }

    // ✅ Build E.164 format - concatenate CC + phone (no re-parsing)
    const cc = victimCC.replace('+', ''); // "91"
    const digitsOnly = victimPhone.replace(/\D/g, ''); // "8639127753"
    const e164Phone = `+${cc}${digitsOnly}`; // "+918639127753"

    console.log(`📝 Built E.164 format: ${e164Phone}`);
    console.log(`   - Country Code: ${victimCC}`);
    console.log(`   - Phone (digits): ${victimPhone}`);
    console.log(`📱 Sending SMS to: ${e164Phone}`);
    
    const result = await smsService.sendSMS(e164Phone, message);
    
    // ✅ Return BOTH countryCode and phoneNumber separately to frontend
    res.json({
      ...result,
      countryCode: victimCC,
      phoneNumber: victimPhone,
      e164Phone
    });
  } catch (error) {
    console.error('❌ Send to request error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Send bulk SMS
 * POST /api/integrations/sms/send-bulk
 * Body: { phoneNumbers, message } OR { assignmentIds, message }
 */
router.post('/sms/send-bulk', authenticate, async (req, res) => {
  try {
    let { phoneNumbers, message, assignmentIds, countryCodes } = req.body;

    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message required' 
      });
    }

    // If assignmentIds provided, fetch phones and country codes from assignments' requests
    if (assignmentIds && Array.isArray(assignmentIds)) {
      console.log(`📱 Fetching phones for ${assignmentIds.length} assignments`);
      
      phoneNumbers = [];
      countryCodes = [];
      const phoneSet = new Set(); // Avoid duplicates
      const phoneDetails = [];

      const assignments = await Assignment.find({ _id: { $in: assignmentIds } })
        .populate('request');

      assignments.forEach((assignment, index) => {
        if (assignment.request) {
          const req_data = assignment.request;
          // ✅ Extract phone (digits only) and country code (stored separately)
          let phone = req_data.submitterContact?.phone;
          let cc = req_data.submitterContact?.countryCode || '+91';

          if (phone && !phoneSet.has(phone)) {
            phoneSet.add(phone);
            phoneNumbers.push(phone);
            countryCodes.push(cc);
            phoneDetails.push({
              phone,
              countryCode: cc,
              assignmentId: assignment._id,
              requestId: req_data._id
            });
          }
        }
      });

      console.log(`✅ Found ${phoneNumbers.length} unique phone numbers from ${assignmentIds.length} assignments`);
      console.log('📝 Phone Details:', phoneDetails);
    }

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone numbers array required and must not be empty' 
      });
    }

    // ✅ Build E.164 format for each phone - concatenate CC + phone (no re-parsing)
    const e164PhoneNumbers = phoneNumbers.map((phone, index) => {
      const cc = (countryCodes?.[index] || '+91').replace('+', '');
      const digitsOnly = phone.replace(/\D/g, '');
      return `+${cc}${digitsOnly}`;
    });

    console.log(`📱 Sending bulk SMS to ${e164PhoneNumbers.length} recipients`);
    console.log(`   E.164 Phones: ${e164PhoneNumbers.join(', ')}`);
    
    const result = await smsService.sendBulkSMS(e164PhoneNumbers, message);
    
    // ✅ Return BOTH phoneNumbers and countryCodes arrays separately
    res.json({
      ...result,
      phoneNumbers,
      countryCodes,
      e164PhoneNumbers
    });
  } catch (error) {
    console.error('❌ Send bulk SMS error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Handle SMS webhook (incoming messages)
 * POST /api/integrations/sms/webhook
 */
router.post('/sms/webhook', async (req, res) => {
  try {
    const result = await smsService.handleIncomingSMS(req.body);
    res.json(result);
  } catch (error) {
    console.error('SMS webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Fetch phone numbers from request (for bulk SMS)
 * GET /api/integrations/sms/fetch-phone-numbers
 * Query params: requestIds (comma-separated) OR assignmentIds (comma-separated)
 */
router.get('/sms/fetch-phone-numbers', authenticate, async (req, res) => {
  try {
    const { requestIds, assignmentIds } = req.query;

    const phoneNumbers = [];
    const phoneMap = {}; // Map to avoid duplicates and track details

    // If requestIds provided, fetch phone from requests
    if (requestIds) {
      const ids = requestIds.split(',').map(id => id.trim());
      const requests = await Request.find({ _id: { $in: ids } });

      requests.forEach(request => {
        // ✅ Extract phone (digits only) and country code (stored separately)
        const phone = request.submitterContact?.phone;
        const countryCode = request.submitterContact?.countryCode || '+91';

        if (phone && !phoneMap[phone]) {
          phoneMap[phone] = true;
          phoneNumbers.push({
            phone,              // Digits only: "8639127753"
            countryCode,        // CC: "+91"
            requestId: request._id,
            source: 'direct_request'
          });
        }
      });
    }

    // If assignmentIds provided, fetch phone from assignments' requests
    if (assignmentIds) {
      const ids = assignmentIds.split(',').map(id => id.trim());
      const assignments = await Assignment.find({ _id: { $in: ids } })
        .populate('request');

      assignments.forEach(assignment => {
        if (assignment.request) {
          // ✅ Extract phone (digits only) and country code (stored separately)
          const phone = assignment.request.submitterContact?.phone;
          const countryCode = assignment.request.submitterContact?.countryCode || '+91';

          if (phone && !phoneMap[phone]) {
            phoneMap[phone] = true;
            phoneNumbers.push({
              phone,              // Digits only: "8639127753"
              countryCode,        // CC: "+91"
              requestId: assignment.request._id,
              assignmentId: assignment._id,
              source: 'assignment_request'
            });
          }
        }
      });
    }

    console.log(`✅ Found ${phoneNumbers.length} phone numbers`);
    phoneNumbers.forEach((item, i) => {
      console.log(`   ${i+1}. ${item.countryCode}${item.phone}`);
    });

    res.json({
      success: true,
      phoneNumbers,
      count: phoneNumbers.length,
      message: `Found ${phoneNumbers.length} phone numbers`
    });
  } catch (error) {
    console.error('❌ Fetch phone numbers error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to fetch phone numbers'
    });
  }
});

/**
 * Get victim phone number by assignment ID
 * GET /api/integrations/sms/get-victim-phone/:assignmentId
 */
router.get('/sms/get-victim-phone/:assignmentId', authenticate, async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await Assignment.findById(assignmentId)
      .populate('request');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    if (!assignment.request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    const request = assignment.request;
    
    // ✅ Extract phone SEPARATELY - NO CONCATENATION
    let countryCode = '+91'; // Default
    let phoneNumber = '';
    let victimPhone = ''; // For E.164 format if needed
    
    if (request.submitterContact?.phone) {
      // submitterContact.phone should ONLY be digits (stored separately from country code)
      phoneNumber = request.submitterContact.phone;
      countryCode = request.submitterContact?.countryCode || '+91';
      victimPhone = `${countryCode}${phoneNumber}`;
    } else if (request.phoneNumber) {
      // Fallback: extract digits from legacy field
      phoneNumber = String(request.phoneNumber).replace(/\D/g, '');
      victimPhone = request.phoneNumber;
    } else if (request.phone) {
      // Fallback: extract digits from legacy field
      phoneNumber = String(request.phone).replace(/\D/g, '');
      victimPhone = request.phone;
    }
    
    console.log(`📝 Phone extraction for assignment ${assignmentId}:`);
    console.log(`   - Country Code: ${countryCode}`);
    console.log(`   - Phone Number (digits only): ${phoneNumber}`);
    console.log(`   - Combined (E.164): ${victimPhone}`);

    if (!victimPhone) {
      return res.status(404).json({
        success: false,
        error: 'No phone number available for this victim',
        debug: {
          requestId: request._id,
          hasSubmitterContact: !!request.submitterContact,
          submitterContactCountryCode: request.submitterContact?.countryCode || null,
          submitterContactPhone: request.submitterContact?.phone || null,
          phoneNumberField: request.phoneNumber || null,
          phoneField: request.phone || null
        }
      });
    }

    res.json({
      success: true,
      phone: victimPhone,
      assignmentId,
      requestId: request._id,
      countryCode,
      phoneNumber,
      beneficiaries: request.beneficiaries,
      location: request.location?.address,
      source: request.submitterContact?.phone ? 'submitterContact' : 
              request.phoneNumber ? 'phoneNumber' : 'phone',
      debug: {
        hasSubmitterContact: !!request.submitterContact,
        allPhoneSources: {
          submitterContact: {
            countryCode: request.submitterContact?.countryCode,
            phone: request.submitterContact?.phone
          },
          phoneNumber: request.phoneNumber,
          phone: request.phone
        }
      }
    });
  } catch (error) {
    console.error('❌ Get victim phone error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to fetch victim phone number'
    });
  }
});

/**
 * Test SMS service
 * GET /api/integrations/sms/test
 */
router.get('/sms/test', authenticate, async (req, res) => {
  try {
    const result = await smsService.testSMSService();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
