import crypto from 'crypto';
import axios from 'axios';
import { Webhook } from '../models/Webhook.js';

/**
 * Trigger webhooks for specific events
 * Calls all registered webhooks for the event type
 */
export async function triggerWebhook(event, data) {
  try {
    // Find all active webhooks for this event
    const webhooks = await Webhook.find({
      event,
      active: true
    }).lean();

    if (webhooks.length === 0) {
      console.log(`ℹ️  No webhooks registered for event: ${event}`);
      return { success: true, webhooksTriggered: 0 };
    }

    const payload = {
      event,
      data,
      timestamp: new Date().toISOString(),
      source: 'DisasterAid'
    };

    let successCount = 0;
    let failureCount = 0;

    for (const webhook of webhooks) {
      try {
        // Generate signature
        const signature = generateSignature(webhook.secret, payload);

        // Call the webhook
        const response = await axios.post(webhook.url, payload, {
          timeout: 5000,
          headers: {
            'X-Disaster-Aid-Signature': signature,
            'X-Disaster-Aid-Event': event,
            'Content-Type': 'application/json'
          }
        });

        console.log(`✅ Webhook triggered successfully: ${webhook.url} (${event})`);
        successCount++;

        // Log webhook call
        await logWebhookCall(webhook._id, event, true, response.status, null);
      } catch (error) {
        console.error(`❌ Webhook failed: ${webhook.url}`, error.message);
        failureCount++;

        // Log webhook call failure
        await logWebhookCall(webhook._id, event, false, null, error.message);
      }
    }

    return {
      success: true,
      webhooksTriggered: webhooks.length,
      successful: successCount,
      failed: failureCount
    };
  } catch (error) {
    console.error('❌ Failed to trigger webhooks:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Create a webhook
 */
export async function createWebhook(url, event, secret, createdBy) {
  try {
    // Validate URL
    try {
      new URL(url);
    } catch {
      return { success: false, error: 'Invalid URL' };
    }

    const webhook = new Webhook({
      url,
      event,
      secret: secret || crypto.randomBytes(32).toString('hex'),
      createdBy,
      active: true,
      failureCount: 0
    });

    await webhook.save();

    console.log(`✅ Webhook created: ${url} for event: ${event}`);
    return { success: true, webhook };
  } catch (error) {
    console.error('❌ Failed to create webhook:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Update webhook
 */
export async function updateWebhook(webhookId, updates) {
  try {
    const webhook = await Webhook.findByIdAndUpdate(webhookId, updates, { new: true });

    if (!webhook) {
      return { success: false, error: 'Webhook not found' };
    }

    console.log(`✅ Webhook updated: ${webhook.url}`);
    return { success: true, webhook };
  } catch (error) {
    console.error('❌ Failed to update webhook:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Delete webhook
 */
export async function deleteWebhook(webhookId) {
  try {
    const webhook = await Webhook.findByIdAndDelete(webhookId);

    if (!webhook) {
      return { success: false, error: 'Webhook not found' };
    }

    console.log(`✅ Webhook deleted: ${webhook.url}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to delete webhook:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get webhooks for user
 */
export async function getUserWebhooks(userId) {
  try {
    const webhooks = await Webhook.find({
      createdBy: userId
    }).lean();

    return { success: true, webhooks };
  } catch (error) {
    console.error('❌ Failed to fetch webhooks:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test webhook by sending test payload
 */
export async function testWebhook(webhook) {
  try {
    const testPayload = {
      event: 'test.event',
      data: {
        message: 'This is a test webhook from Disaster Aid',
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      source: 'DisasterAid'
    };

    const signature = generateSignature(webhook.secret, testPayload);

    const response = await axios.post(webhook.url, testPayload, {
      timeout: 5000,
      headers: {
        'X-Disaster-Aid-Signature': signature,
        'X-Disaster-Aid-Event': 'test.event',
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Webhook test successful: ${webhook.url}`);
    return { success: true, statusCode: response.status };
  } catch (error) {
    console.error(`❌ Webhook test failed: ${webhook.url}`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Generate HMAC signature for webhook
 */
function generateSignature(secret, payload) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * Log webhook call for audit trail
 */
async function logWebhookCall(webhookId, event, success, statusCode, errorMessage) {
  try {
    const logEntry = {
      webhookId,
      event,
      success,
      statusCode,
      errorMessage,
      timestamp: new Date()
    };

    // In production, store in database or logging service
    console.log('📋 Webhook call logged:', logEntry);
  } catch (error) {
    console.error('Failed to log webhook call:', error.message);
  }
}

/**
 * Auto-disable webhook after too many failures
 */
export async function checkWebhookHealth() {
  try {
    const failedWebhooks = await Webhook.find({
      active: true,
      failureCount: { $gte: 10 }
    });

    for (const webhook of failedWebhooks) {
      await Webhook.findByIdAndUpdate(webhook._id, { active: false });
      console.log(`⚠️  Webhook disabled due to repeated failures: ${webhook.url}`);
    }

    return { success: true, disabledCount: failedWebhooks.length };
  } catch (error) {
    console.error('❌ Failed to check webhook health:', error.message);
    return { success: false, error: error.message };
  }
}

export default {
  triggerWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getUserWebhooks,
  testWebhook,
  checkWebhookHealth
};
