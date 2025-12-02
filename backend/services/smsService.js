import twilio from 'twilio';
import dotenv from 'dotenv';
import { SmsLog } from '../models/SmsLog.js';
import { User } from '../models/User.js';

dotenv.config();

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Send SMS to a phone number
 */
async function sendSMS(phoneNumber, message) {
  try {
    if (!phoneNumber || !message) {
      return { 
        success: false, 
        error: 'Phone number and message required' 
      };
    }

    // Validate SMS provider is configured
    if (!client || !fromPhoneNumber) {
      console.warn('⚠️  SMS service not configured (Twilio credentials missing)');
      return { 
        success: false, 
        error: 'SMS service not configured' 
      };
    }

    // Send SMS via Twilio
    const result = await client.messages.create({
      body: message,
      from: fromPhoneNumber,
      to: phoneNumber
    });

    // Log SMS (map Twilio status to our enum values)
    const statusMap = {
      'queued': 'sent',
      'sending': 'sent',
      'sent': 'sent',
      'delivered': 'delivered',
      'failed': 'failed',
      'undelivered': 'failed'
    };
    
    const logStatus = statusMap[result.status] || 'sent';
    
    await SmsLog.create({
      phoneNumber,
      message,
      direction: 'outbound',
      provider: 'twilio',
      messageId: result.sid,
      status: logStatus,
      timestamp: new Date()
    });

    console.log(`📱 SMS sent to ${phoneNumber}: ${result.sid} (Status: ${result.status})`);
    return { 
      success: true, 
      messageId: result.sid,
      status: result.status 
    };
  } catch (error) {
    console.error('❌ Failed to send SMS:', error.message);
    
    // Log failed SMS
    try {
      await SmsLog.create({
        phoneNumber,
        message,
        direction: 'outbound',
        provider: 'twilio',
        status: 'failed',
        error: error.message,
        timestamp: new Date()
      });
    } catch (logError) {
      console.error('Failed to log SMS error:', logError);
    }

    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Send bulk SMS to multiple recipients
 */
async function sendBulkSMS(phoneNumbers, message) {
  try {
    if (!phoneNumbers || !Array.isArray(phoneNumbers) || !message) {
      return { 
        success: false, 
        error: 'Phone numbers array and message required' 
      };
    }

    if (!client || !fromPhoneNumber) {
      console.warn('⚠️  SMS service not configured');
      return { 
        success: false, 
        error: 'SMS service not configured' 
      };
    }

    const results = [];
    const errors = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        const result = await client.messages.create({
          body: message,
          from: fromPhoneNumber,
          to: phoneNumber
        });

        // Log SMS (map Twilio status to our enum values)
        const statusMap = {
          'queued': 'sent',
          'sending': 'sent',
          'sent': 'sent',
          'delivered': 'delivered',
          'failed': 'failed',
          'undelivered': 'failed'
        };
        
        const logStatus = statusMap[result.status] || 'sent';

        await SmsLog.create({
          phoneNumber,
          message,
          direction: 'outbound',
          provider: 'twilio',
          messageId: result.sid,
          status: logStatus,
          timestamp: new Date()
        });

        results.push({
          phoneNumber,
          success: true,
          messageId: result.sid,
          status: result.status
        });
      } catch (error) {
        console.error(`Failed to send SMS to ${phoneNumber}:`, error.message);
        
        try {
          await SmsLog.create({
            phoneNumber,
            message,
            direction: 'outbound',
            provider: 'twilio',
            status: 'failed',
            error: error.message,
            timestamp: new Date()
          });
        } catch (logError) {
          console.error('Failed to log SMS error:', logError);
        }

        errors.push({
          phoneNumber,
          error: error.message
        });
      }
    }

    console.log(`📱 Bulk SMS: ${results.length} sent, ${errors.length} failed`);
    return { 
      success: errors.length === 0, 
      sent: results.length,
      failed: errors.length,
      results,
      errors 
    };
  } catch (error) {
    console.error('❌ Bulk SMS failed:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Handle incoming SMS from webhook (Twilio)
 */
async function handleIncomingSMS(webhookData) {
  try {
    const { From, To, Body, MessageSid, AccountSid } = webhookData;

    if (!From || !Body || !MessageSid) {
      return { 
        success: false, 
        error: 'Invalid webhook data' 
      };
    }

    // Verify webhook is from Twilio
    if (AccountSid !== accountSid) {
      console.warn('⚠️  SMS webhook from unauthorized Twilio account');
      return { 
        success: false, 
        error: 'Unauthorized webhook' 
      };
    }

    // Log incoming SMS
    const smsLog = await SmsLog.create({
      phoneNumber: From,
      message: Body,
      direction: 'inbound',
      provider: 'twilio',
      messageId: MessageSid,
      status: 'received',
      timestamp: new Date(),
      metadata: { to: To }
    });

    // Find user by phone number
    const user = await User.findOne({ phoneNumber: From });

    if (user) {
      // Link SMS to user
      smsLog.userId = user._id;
      await smsLog.save();

      // Optionally trigger custom handler
      console.log(`📱 Incoming SMS from ${From} (User: ${user._id}): ${Body}`);
    } else {
      console.log(`📱 Incoming SMS from unknown number ${From}: ${Body}`);
    }

    return { 
      success: true, 
      smsLogId: smsLog._id,
      message: 'SMS received and logged' 
    };
  } catch (error) {
    console.error('❌ Failed to handle incoming SMS:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Test SMS service
 */
async function testSMSService() {
  try {
    if (!client || !fromPhoneNumber) {
      return { 
        success: false, 
        configured: false,
        error: 'SMS service not configured (missing Twilio credentials)' 
      };
    }

    // Test by checking Twilio account
    const account = await client.api.accounts(accountSid).fetch();

    return { 
      success: true,
      configured: true,
      provider: 'Twilio',
      accountStatus: account.status,
      phoneNumber: fromPhoneNumber,
      message: 'SMS service is configured and working' 
    };
  } catch (error) {
    console.error('❌ SMS service test failed:', error.message);
    return { 
      success: false,
      configured: false,
      error: error.message 
    };
  }
}

export default {
  sendSMS,
  sendBulkSMS,
  handleIncomingSMS,
  testSMSService
};
