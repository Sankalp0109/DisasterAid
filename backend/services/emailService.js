import { createTransport } from 'nodemailer';
import dotenv from 'dotenv';
import { EmailLog } from '../models/EmailLog.js';

dotenv.config();

// Check if email is properly configured
const isEmailConfigured = () => {
  if (process.env.MAILTRAP_HOST) {
    const hasMailtrap = process.env.MAILTRAP_USER && 
                       process.env.MAILTRAP_PASS && 
                       process.env.MAILTRAP_USER !== 'your_mailtrap_username';
    if (!hasMailtrap) {
      console.warn('⚠️  Mailtrap credentials not configured. Email sending disabled.');
      console.warn('📧 To enable emails, sign up at https://mailtrap.io and update .env file');
      return false;
    }
    return true;
  } else if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    return true;
  }
  console.warn('⚠️  Email service not configured. Email sending disabled.');
  return false;
};

const EMAIL_ENABLED = isEmailConfigured();

// Configure email transporter only if configured
let transporter = null;
let emailProvider = 'other';

if (EMAIL_ENABLED) {
  if (process.env.MAILTRAP_HOST) {
    // Mailtrap configuration (for testing)
    emailProvider = 'mailtrap';
    transporter = createTransport({
      host: process.env.MAILTRAP_HOST,
      port: parseInt(process.env.MAILTRAP_PORT) || 2525,
      auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS
      },
      connectionTimeout: 10000,  // 10 seconds timeout
      greetingTimeout: 10000,
      socketTimeout: 10000,
      logger: true, // Enable logging for debugging
      debug: false  // Set to true for detailed SMTP logs
    });
  } else if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    // Gmail configuration (for production)
    emailProvider = 'gmail';
    transporter = createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });
  }
  
  console.log(`📧 Email service initialized with provider: ${emailProvider}`);
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Log email to database
 */
async function logEmail({ to, from, subject, body, emailType, userId, requestId, assignmentId, status, error, messageId, priority, metadata }) {
  try {
    await EmailLog.create({
      to,
      from,
      subject,
      body,
      emailType,
      userId,
      requestId,
      assignmentId,
      provider: emailProvider,
      messageId,
      status,
      error,
      priority: priority || 'normal',
      metadata: metadata || {},
      timestamp: new Date(),
      sentAt: status === 'sent' ? new Date() : null
    });
  } catch (logError) {
    console.error('❌ Failed to log email:', logError.message);
  }
}

/**
 * Send critical alert to authority
 */
export async function sendCriticalAlert(email, subject, details, userId, requestId) {
  const fromEmail = process.env.EMAIL_USER || 'noreply@disasteraid.com';
  const fullSubject = `🚨 CRITICAL: ${subject}`;
  
  try {
    if (!email) {
      console.warn('⚠️  No email provided for critical alert');
      await logEmail({ 
        to: email || 'unknown', 
        from: fromEmail, 
        subject: fullSubject, 
        body: 'Email not provided',
        emailType: 'critical_alert',
        userId,
        requestId,
        status: 'failed',
        error: 'No recipient email',
        priority: 'high'
      });
      return { success: false, error: 'No recipient email' };
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 24px;">⚠️ CRITICAL ALERT</h2>
        </div>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
          <p style="color: #1f2937; font-size: 16px; margin-bottom: 15px;"><strong>${subject}</strong></p>
          
          <div style="background: white; padding: 15px; border-left: 4px solid #dc2626; margin-bottom: 15px;">
            ${Object.entries(details)
              .map(
                ([key, value]) =>
                  `<p style="margin: 8px 0; color: #374151;">
                    <strong style="color: #1f2937;">${key}:</strong> ${value}
                  </p>`
              )
              .join('')}
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 15px;">
            Please log in to the dashboard immediately to review and take action.
          </p>
          
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" 
             style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 15px;">
            Open Dashboard
          </a>
        </div>
        
        <div style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
          <p>This is an automated alert from Disaster Aid System</p>
          <p>${new Date().toLocaleString()}</p>
        </div>
      </div>
    `;

    const textBody = `CRITICAL ALERT: ${subject}\n\n${Object.entries(details)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')}`;

    const result = await transporter.sendMail({
      from: `Disaster Aid <${fromEmail}>`,
      to: email,
      subject: fullSubject,
      html,
      text: textBody,
      priority: 'high'
    });

    console.log(`✉️  Critical alert sent to ${email}`);
    
    // Log successful email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject: fullSubject, 
      body: textBody,
      emailType: 'critical_alert',
      userId,
      requestId,
      status: 'sent',
      messageId: result.messageId,
      priority: 'high',
      metadata: { details }
    });
    
    return { success: true, result };
  } catch (error) {
    console.error('❌ Failed to send critical alert:', error.message);
    
    // Log failed email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject: fullSubject, 
      body: `Critical alert failed: ${subject}`,
      emailType: 'critical_alert',
      userId,
      requestId,
      status: 'failed',
      error: error.message,
      priority: 'high',
      metadata: { details }
    });
    
    return { success: false, error: error.message };
  }
}

/**
 * Send new assignment notification to NGO
 */
export async function sendAssignmentNotification(ngoEmail, ngoName, request, assignment, userId) {
  const fromEmail = process.env.EMAIL_USER || 'noreply@disasteraid.com';
  const subject = `📋 New Assignment: ${request.title}`;
  
  try {
    if (!ngoEmail) {
      console.warn('⚠️  No email provided for NGO notification');
      await logEmail({ 
        to: ngoEmail || 'unknown', 
        from: fromEmail, 
        subject, 
        body: 'Email not provided',
        emailType: 'assignment_notification',
        userId,
        requestId: request._id,
        assignmentId: assignment._id,
        status: 'failed',
        error: 'No recipient email'
      });
      return { success: false, error: 'No recipient email' };
    }

    const needsList = Object.entries(request.needs || {})
      .filter(([_, need]) => need.required)
      .map(([category, need]) => `• ${category.toUpperCase()}: ${need.quantity || 'As needed'} ${need.unit || 'units'}`)
      .join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 24px;">✓ New Assignment</h2>
        </div>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
          <p style="color: #1f2937; font-size: 14px; margin-bottom: 15px;">
            Hello <strong>${ngoName}</strong>,
          </p>
          
          <p style="color: #1f2937; font-size: 14px; margin-bottom: 15px;">
            You have been assigned a new request to fulfill. Details below:
          </p>
          
          <div style="background: white; padding: 15px; border-left: 4px solid #10b981; margin-bottom: 15px;">
            <p style="margin: 8px 0;"><strong>Ticket #</strong>: ${request.ticketNumber}</p>
            <p style="margin: 8px 0;"><strong>Title</strong>: ${request.title}</p>
            <p style="margin: 8px 0;"><strong>Priority</strong>: <span style="color: ${getPriorityColor(request.priority)}; font-weight: bold;">${request.priority.toUpperCase()}</span></p>
            <p style="margin: 8px 0;"><strong>Location</strong>: ${request.location?.address || 'Address not provided'}</p>
            <p style="margin: 8px 0;"><strong>Victim Contact</strong>: ${request.createdBy?.phone || 'N/A'}</p>
            
            <p style="margin-top: 12px; color: #6b7280;"><strong>Needs:</strong></p>
            <pre style="background: #f9fafb; padding: 10px; border-radius: 4px; color: #374151; font-size: 13px; white-space: pre-wrap;">${needsList}</pre>
            
            ${request.description ? `<p style="margin: 8px 0;"><strong>Notes</strong>: ${request.description}</p>` : ''}
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            Please update the status in your dashboard as you fulfill this request. Mark as delivered when complete.
          </p>
          
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/ngo/dashboard" 
             style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 15px;">
            View in Dashboard
          </a>
        </div>
        
        <div style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
          <p>This is an automated notification from Disaster Aid System</p>
        </div>
      </div>
    `;

    const textBody = `New Assignment: ${request.title}\n\nPriority: ${request.priority}\nLocation: ${request.location?.address}\n\nNeeds:\n${needsList}`;

    const result = await transporter.sendMail({
      from: `Disaster Aid <${fromEmail}>`,
      to: ngoEmail,
      subject,
      html,
      text: textBody
    });

    console.log(`✉️  Assignment notification sent to ${ngoName} (${ngoEmail})`);
    
    // Log successful email
    await logEmail({ 
      to: ngoEmail, 
      from: fromEmail, 
      subject, 
      body: textBody,
      emailType: 'assignment_notification',
      userId,
      requestId: request._id,
      assignmentId: assignment._id,
      status: 'sent',
      messageId: result.messageId,
      metadata: { ngoName, ticketNumber: request.ticketNumber }
    });
    
    return { success: true, result };
  } catch (error) {
    console.error('❌ Failed to send assignment notification:', error.message);
    
    // Log failed email
    await logEmail({ 
      to: ngoEmail, 
      from: fromEmail, 
      subject, 
      body: textBody,
      emailType: 'assignment_notification',
      userId,
      requestId: request._id,
      assignmentId: assignment._id,
      status: 'failed',
      error: error.message,
      metadata: { ngoName, ticketNumber: request.ticketNumber }
    });
    
    return { success: false, error: error.message };
  }
}

/**
 * Send SoS alert to authority
 */
export async function sendSoSAlert(email, request, userId) {
  const fromEmail = process.env.EMAIL_USER || 'noreply@disasteraid.com';
  const subject = `🆘 SOS ALERT - IMMEDIATE ACTION REQUIRED - ${request.location?.address || 'Emergency'}`;
  
  try {
    if (!email) {
      await logEmail({ 
        to: email || 'unknown', 
        from: fromEmail, 
        subject, 
        body: 'Email not provided',
        emailType: 'sos_alert',
        userId,
        requestId: request._id,
        status: 'failed',
        error: 'No recipient email',
        priority: 'high'
      });
      return { success: false, error: 'No recipient email' };
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 36px;">🆘 SOS ALERT</h1>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; border: 3px solid #dc2626;">
          <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
            <strong>EMERGENCY REQUEST - IMMEDIATE ACTION REQUIRED</strong>
          </p>
          
          <div style="background: #fef2f2; padding: 20px; border-left: 4px solid #dc2626; margin-bottom: 20px;">
            <p style="margin: 10px 0;"><strong>Ticket #</strong>: ${request.ticketNumber}</p>
            <p style="margin: 10px 0;"><strong>Location</strong>: ${request.location?.address || 'Exact location provided in dashboard'}</p>
            <p style="margin: 10px 0;"><strong>Coordinates</strong>: ${request.location?.coordinates ? `Lat: ${request.location.coordinates[1]}, Lng: ${request.location.coordinates[0]}` : 'N/A'}</p>
            <p style="margin: 10px 0;"><strong>Contact</strong>: ${request.createdBy?.phone || 'Not provided'}</p>
            <p style="margin: 10px 0;"><strong>Reported</strong>: ${new Date(request.createdAt).toLocaleString()}</p>
            
            ${request.description ? `<p style="margin: 10px 0;"><strong>Details</strong>: ${request.description}</p>` : ''}
          </div>
          
          <p style="color: #dc2626; font-weight: bold; font-size: 16px;">
            ⚡ Dispatch nearest available resources immediately
          </p>
          
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/authority/dashboard?tab=sos" 
             style="display: inline-block; background: #dc2626; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 20px; font-size: 16px;">
            View Emergency Details
          </a>
        </div>
      </div>
    `;

    const textBody = `SOS ALERT - IMMEDIATE ACTION REQUIRED\n\nTicket: ${request.ticketNumber}\nLocation: ${request.location?.address}\nContact: ${request.createdBy?.phone}\n\nPlease check the dashboard immediately.`;

    const result = await transporter.sendMail({
      from: `Disaster Aid SOS <${fromEmail}>`,
      to: email,
      subject,
      html,
      priority: 'high',
      text: textBody
    });

    console.log(`🆘 SoS alert sent to ${email}`);
    
    // Log successful email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject, 
      body: textBody,
      emailType: 'sos_alert',
      userId,
      requestId: request._id,
      status: 'sent',
      messageId: result.messageId,
      priority: 'high',
      metadata: { ticketNumber: request.ticketNumber, location: request.location?.address }
    });
    
    return { success: true, result };
  } catch (error) {
    console.error('❌ Failed to send SoS alert:', error.message);
    
    // Log failed email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject, 
      body: textBody,
      emailType: 'sos_alert',
      userId,
      requestId: request._id,
      status: 'failed',
      error: error.message,
      priority: 'high',
      metadata: { ticketNumber: request.ticketNumber, location: request.location?.address }
    });
    
    return { success: false, error: error.message };
  }
}

/**
 * Send delivery confirmation notification
 */
export async function sendDeliveryConfirmation(email, recipientName, request, ngoPOC, userId) {
  const fromEmail = process.env.EMAIL_USER || 'noreply@disasteraid.com';
  const subject = `✅ Your Relief Request #${request.ticketNumber} Has Been Delivered`;
  
  try {
    if (!email) {
      await logEmail({ 
        to: email || 'unknown', 
        from: fromEmail, 
        subject, 
        body: 'Email not provided',
        emailType: 'delivery_confirmation',
        userId,
        requestId: request._id,
        status: 'failed',
        error: 'No recipient email'
      });
      return { success: false, error: 'No recipient email' };
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 24px;">✅ Delivery Confirmed</h2>
        </div>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
          <p style="color: #1f2937; font-size: 14px; margin-bottom: 15px;">
            Dear ${recipientName},
          </p>
          
          <p style="color: #1f2937; font-size: 14px; margin-bottom: 15px;">
            Your relief request has been fulfilled. Delivery has been confirmed.
          </p>
          
          <div style="background: white; padding: 15px; border-left: 4px solid #10b981; margin-bottom: 15px;">
            <p style="margin: 8px 0;"><strong>Request #</strong>: ${request.ticketNumber}</p>
            <p style="margin: 8px 0;"><strong>Items</strong>: ${request.title}</p>
            <p style="margin: 8px 0;"><strong>Delivered by</strong>: ${ngoPOC?.name || 'Relief Organization'}</p>
            <p style="margin: 8px 0;"><strong>Delivered on</strong>: ${new Date().toLocaleString()}</p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            Thank you for working with us during this crisis. If you need additional assistance, please visit our dashboard or contact us.
          </p>
        </div>
        
        <div style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
          <p>Disaster Aid System</p>
        </div>
      </div>
    `;

    const textBody = `Your relief request has been fulfilled and delivered.\n\nRequest #: ${request.ticketNumber}\nItems: ${request.title}\n\nThank you.`;

    const result = await transporter.sendMail({
      from: `Disaster Aid <${fromEmail}>`,
      to: email,
      subject,
      html,
      text: textBody
    });

    console.log(`✅ Delivery confirmation sent to ${email}`);
    
    // Log successful email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject, 
      body: textBody,
      emailType: 'delivery_confirmation',
      userId,
      requestId: request._id,
      status: 'sent',
      messageId: result.messageId,
      metadata: { ticketNumber: request.ticketNumber, ngoPOC: ngoPOC?.name }
    });
    
    return { success: true, result };
  } catch (error) {
    console.error('❌ Failed to send delivery confirmation:', error.message);
    
    // Log failed email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject, 
      body: textBody,
      emailType: 'delivery_confirmation',
      userId,
      requestId: request._id,
      status: 'failed',
      error: error.message,
      metadata: { ticketNumber: request.ticketNumber, ngoPOC: ngoPOC?.name }
    });
    
    return { success: false, error: error.message };
  }
}

/**
 * Send welcome email with credentials to newly created user
 */
export async function sendUserCredentials(email, name, role, temporaryPassword, createdBy, userId) {
  const fromEmail = process.env.EMAIL_USER || 'noreply@disasteraid.com';
  const subject = `Welcome to DisasterAid - Your Account Credentials`;
  
  try {
    if (!email) {
      await logEmail({ 
        to: email || 'unknown', 
        from: fromEmail, 
        subject, 
        body: 'Email not provided',
        emailType: 'user_credentials',
        userId,
        status: 'failed',
        error: 'No recipient email'
      });
      return { success: false, error: 'No recipient email' };
    }
    
    if (!EMAIL_ENABLED) {
      console.warn('⚠️  Email not configured. Credentials NOT sent to:', email);
      console.log('📧 User credentials (save these):');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${temporaryPassword}`);
      console.log(`   Role: ${role}`);
      
      await logEmail({ 
        to: email, 
        from: fromEmail, 
        subject, 
        body: `Credentials: ${email} / ${temporaryPassword}`,
        emailType: 'user_credentials',
        userId,
        status: 'failed',
        error: 'Email service not configured'
      });
      
      return { success: false, error: 'Email service not configured' };
    }

    const roleDescriptions = {
      ngo: 'NGO/Volunteer Organization',
      authority: 'Authority/Control Room Staff',
      operator: 'Dispatch Operator',
      admin: 'Platform Administrator'
    };

    const roleDashboards = {
      ngo: '/ngo/dashboard',
      authority: '/authority/dashboard',
      operator: '/operator/dashboard',
      admin: '/admin/dashboard'
    };

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">🔐 Welcome to DisasterAid</h1>
        </div>
        
        <div style="background: #f3f4f6; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
          <p style="color: #1f2937; font-size: 16px; margin-bottom: 15px;">
            Dear <strong>${name}</strong>,
          </p>
          
          <p style="color: #1f2937; font-size: 14px; margin-bottom: 15px;">
            An account has been created for you in the DisasterAid platform by <strong>${createdBy}</strong>.
          </p>
          
          <div style="background: white; padding: 20px; border-left: 4px solid #3b82f6; margin-bottom: 20px;">
            <p style="margin: 8px 0; color: #374151;"><strong>Role:</strong> ${roleDescriptions[role] || role.toUpperCase()}</p>
            <p style="margin: 8px 0; color: #374151;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 8px 0; color: #374151;"><strong>Temporary Password:</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 14px;">${temporaryPassword}</code></p>
          </div>
          
          <div style="background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              ⚠️ <strong>Important:</strong> Please change your password after your first login for security purposes.
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 20px;">
            Click the button below to login to your dashboard:
          </p>
          
          <a href="${FRONTEND_URL}/login" 
             style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-bottom: 15px;">
            Login to Dashboard
          </a>
          
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
            Your dashboard: <a href="${FRONTEND_URL}${roleDashboards[role]}" style="color: #3b82f6;">${FRONTEND_URL}${roleDashboards[role]}</a>
          </p>
        </div>
        
        <div style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
          <p>DisasterAid - Coordinated Crisis Response Platform</p>
          <p>If you didn't expect this email, please contact your administrator.</p>
        </div>
      </div>
    `;

    const textBody = `Welcome to DisasterAid!\n\nYour account has been created.\n\nRole: ${roleDescriptions[role]}\nEmail: ${email}\nTemporary Password: ${temporaryPassword}\n\nPlease login at: ${FRONTEND_URL}/login\n\nIMPORTANT: Change your password after first login.`;
    
    const result = await Promise.race([
      transporter.sendMail({
        from: `DisasterAid <${fromEmail}>`,
        to: email,
        subject,
        html,
        text: textBody
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email timeout - continuing without sending')), 10000)
      )
    ]);

    console.log(`✉️  User credentials sent to ${email}`);
    
    // Log successful email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject, 
      body: textBody,
      emailType: 'user_credentials',
      userId,
      status: 'sent',
      messageId: result.messageId,
      metadata: { role, createdBy }
    });
    
    return { success: true, result };
  } catch (error) {
    console.error('❌ Failed to send user credentials:', error.message);
    console.warn('⚠️  Continuing without email. Please share credentials manually:');
    console.log('📧 User credentials:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${temporaryPassword}`);
    console.log(`   Role: ${role}`);
    
    // Log failed email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject, 
      body: `Credentials: ${email} / ${temporaryPassword} / ${role}`,
      emailType: 'user_credentials',
      userId,
      status: error.message.includes('timeout') ? 'timeout' : 'failed',
      error: error.message,
      metadata: { role, createdBy }
    });
    
    // Don't fail the request, just log the credentials
    return { success: false, error: error.message, credentials: { email, password: temporaryPassword, role } };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email, name, resetToken, userId) {
  // Define at the top so it's available in catch block
  const fromEmail = process.env.EMAIL_USER || 'noreply@disasteraid.com';
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
  const subject = `Password Reset Request - DisasterAid`;
  
  try {
    if (!email) {
      await logEmail({ 
        to: email || 'unknown', 
        from: fromEmail, 
        subject, 
        body: 'Email not provided',
        emailType: 'password_reset',
        userId,
        status: 'failed',
        error: 'No recipient email'
      });
      return { success: false, error: 'No recipient email' };
    }
    
    if (!EMAIL_ENABLED) {
      console.warn('⚠️  Email not configured. Password reset link NOT sent to:', email);
      console.log('🔑 Password reset link (share with user):');
      console.log(`   ${resetUrl}`);
      
      await logEmail({ 
        to: email, 
        from: fromEmail, 
        subject, 
        body: `Reset link: ${resetUrl}`,
        emailType: 'password_reset',
        userId,
        status: 'failed',
        error: 'Email service not configured'
      });
      
      return { success: false, error: 'Email service not configured' };
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">🔑 Password Reset Request</h1>
        </div>
        
        <div style="background: #f3f4f6; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
          <p style="color: #1f2937; font-size: 16px; margin-bottom: 15px;">
            Hello <strong>${name}</strong>,
          </p>
          
          <p style="color: #1f2937; font-size: 14px; margin-bottom: 15px;">
            We received a request to reset your password for your DisasterAid account.
          </p>
          
          <p style="color: #1f2937; font-size: 14px; margin-bottom: 20px;">
            Click the button below to reset your password:
          </p>
          
          <a href="${resetUrl}" 
             style="display: inline-block; background: #7c3aed; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-bottom: 20px;">
            Reset Password
          </a>
          
          <div style="background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
            <p style="margin: 0; color: #92400e; font-size: 13px;">
              ⏱️ This link will expire in <strong>1 hour</strong> for security reasons.
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 13px; margin-bottom: 10px;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="color: #3b82f6; font-size: 12px; word-break: break-all; background: white; padding: 10px; border-radius: 4px;">
            ${resetUrl}
          </p>
          
          <div style="background: #fee2e2; padding: 15px; border-left: 4px solid #dc2626; margin-top: 20px;">
            <p style="margin: 0; color: #991b1b; font-size: 13px;">
              ⚠️ <strong>Didn't request this?</strong> If you didn't request a password reset, please ignore this email and your password will remain unchanged. Someone may have entered your email by mistake.
            </p>
          </div>
        </div>
        
        <div style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
          <p>DisasterAid - Coordinated Crisis Response Platform</p>
          <p>This is an automated email. Please do not reply.</p>
        </div>
      </div>
    `;

    const textBody = `Password Reset Request\n\nHello ${name},\n\nWe received a request to reset your password.\n\nReset your password here: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, please ignore this email.`;
    
    const result = await Promise.race([
      transporter.sendMail({
        from: `DisasterAid Security <${fromEmail}>`,
        to: email,
        subject,
        html,
        text: textBody
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email timeout - continuing without sending')), 10000)
      )
    ]);

    console.log(`✉️  Password reset email sent to ${email}`);
    
    // Log successful email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject, 
      body: textBody,
      emailType: 'password_reset',
      userId,
      status: 'sent',
      messageId: result.messageId,
      metadata: { resetToken }
    });
    
    return { success: true, result };
  } catch (error) {
    console.error('❌ Failed to send password reset email:', error.message);
    console.warn('⚠️  Continuing without email. Please share reset link manually:');
    console.log('🔑 Password reset link:');
    console.log(`   ${resetUrl}`);
    
    // Log failed email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject, 
      body: textBody,
      emailType: 'password_reset',
      userId,
      status: error.message.includes('timeout') ? 'timeout' : 'failed',
      error: error.message,
      metadata: { resetToken }
    });
    
    // Don't fail the request, just log the reset link
    return { success: false, error: error.message, resetUrl };
  }
}

/**
 * Send password changed confirmation email
 */
export async function sendPasswordChangedEmail(email, name, userId) {
  const fromEmail = process.env.EMAIL_USER || 'noreply@disasteraid.com';
  const subject = `Password Changed Successfully - DisasterAid`;
  
  try {
    if (!email) {
      await logEmail({ 
        to: email || 'unknown', 
        from: fromEmail, 
        subject, 
        body: 'Email not provided',
        emailType: 'password_changed',
        userId,
        status: 'failed',
        error: 'No recipient email'
      });
      return { success: false, error: 'No recipient email' };
    }
    
    if (!EMAIL_ENABLED) {
      console.warn('⚠️  Email not configured. Password changed confirmation NOT sent to:', email);
      
      await logEmail({ 
        to: email, 
        from: fromEmail, 
        subject, 
        body: 'Password changed confirmation',
        emailType: 'password_changed',
        userId,
        status: 'failed',
        error: 'Email service not configured'
      });
      
      return { success: false, error: 'Email service not configured' };
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">✅ Password Changed</h1>
        </div>
        
        <div style="background: #f3f4f6; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
          <p style="color: #1f2937; font-size: 16px; margin-bottom: 15px;">
            Hello <strong>${name}</strong>,
          </p>
          
          <p style="color: #1f2937; font-size: 14px; margin-bottom: 15px;">
            This email confirms that your password has been successfully changed.
          </p>
          
          <div style="background: white; padding: 20px; border-left: 4px solid #10b981; margin-bottom: 20px;">
            <p style="margin: 8px 0; color: #374151;"><strong>Account:</strong> ${email}</p>
            <p style="margin: 8px 0; color: #374151;"><strong>Changed on:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <div style="background: #fee2e2; padding: 15px; border-left: 4px solid #dc2626;">
            <p style="margin: 0; color: #991b1b; font-size: 13px;">
              🚨 <strong>Didn't change your password?</strong> If you didn't make this change, contact your administrator immediately as your account may have been compromised.
            </p>
          </div>
          
          <a href="${FRONTEND_URL}/login" 
             style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 20px;">
            Login to Dashboard
          </a>
        </div>
        
        <div style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
          <p>DisasterAid - Coordinated Crisis Response Platform</p>
        </div>
      </div>
    `;

    const textBody = `Password Changed Successfully\n\nHello ${name},\n\nYour password has been changed on ${new Date().toLocaleString()}.\n\nIf you didn't make this change, contact your administrator immediately.`;
    
    const result = await Promise.race([
      transporter.sendMail({
        from: `DisasterAid Security <${fromEmail}>`,
        to: email,
        subject,
        html,
        text: textBody
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email timeout - continuing without sending')), 10000)
      )
    ]);

    console.log(`✉️  Password changed confirmation sent to ${email}`);
    
    // Log successful email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject, 
      body: textBody,
      emailType: 'password_changed',
      userId,
      status: 'sent',
      messageId: result.messageId
    });
    
    return { success: true, result };
  } catch (error) {
    console.error('❌ Failed to send password changed email:', error.message);
    console.warn('⚠️  Password changed successfully but confirmation email not sent');
    
    // Log failed email
    await logEmail({ 
      to: email, 
      from: fromEmail, 
      subject, 
      body: textBody,
      emailType: 'password_changed',
      userId,
      status: error.message.includes('timeout') ? 'timeout' : 'failed',
      error: error.message
    });
    
    // Don't fail the request - password was changed successfully
    return { success: false, error: error.message };
  }
}

/**
 * Test email service
 */
export async function testEmailService() {
  try {
    // Verify connection
    await transporter.verify();
    console.log('✅ Email service connected successfully');
    return { success: true, message: 'Email service is ready' };
  } catch (error) {
    console.error('❌ Email service verification failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Helper to get priority color
 */
function getPriorityColor(priority) {
  const colors = {
    sos: '#dc2626',
    critical: '#dc2626',
    high: '#f97316',
    medium: '#eab308',
    low: '#10b981'
  };
  return colors[priority] || '#6b7280';
}

export default {
  sendCriticalAlert,
  sendAssignmentNotification,
  sendSoSAlert,
  sendDeliveryConfirmation,
  sendUserCredentials,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  testEmailService
};
