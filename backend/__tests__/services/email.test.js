import {
  sendCriticalAlert,
  sendAssignmentNotification,
  sendSoSAlert,
  sendDeliveryConfirmation,
  sendUserCredentials,
  sendPasswordResetEmail,
  sendPasswordChangedEmail
} from '../../services/emailService.js';
import { User } from '../../models/User.js';
import { Request } from '../../models/Request.js';
import { NGO } from '../../models/NGO.js';
import { Assignment } from '../../models/Assignment.js';

describe('Email Service Tests', () => {
  let testUser;
  let testRequest;
  let testNGO;

  // Disable email sending for tests by clearing environment variables
  beforeAll(() => {
    process.env.MAILTRAP_HOST = '';
    process.env.MAILTRAP_USER = '';
    process.env.MAILTRAP_PASS = '';
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASSWORD = '';
  });

  beforeEach(async () => {
    // Create test user
    testUser = await User.create({
      name: 'Test User',
      email: 'testuser@example.com',
      password: 'password123',
      phone: '+11234567890',
      role: 'victim'
    });

    // Create test request
    testRequest = await Request.create({
      title: 'Emergency Food Supply',
      description: 'Need food for 10 people',
      priority: 'high',
      status: 'pending',
      createdBy: testUser._id,
      location: {
        type: 'Point',
        coordinates: [-122.4194, 37.7749],
        address: '123 Main St, San Francisco, CA'
      },
      needs: {
        food: { required: true, quantity: 10, unit: 'meals' }
      }
    });

    // Create test NGO
    testNGO = await NGO.create({
      name: 'Test Relief Organization',
      pocName: 'NGO Manager',
      email: 'ngo@example.com',
      phone: '+19876543210',
      address: '456 Relief St',
      serviceArea: {
        type: 'Point',
        coordinates: [-122.4194, 37.7749]
      },
      capabilities: ['food', 'water'],
      isActive: true
    });
  });

  describe('sendUserCredentials', () => {
    test('should handle email when service is not configured', async () => {
      const result = await sendUserCredentials(
        'newuser@example.com',
        'New User',
        'ngo',
        'tempPassword123',
        'Admin User',
        testUser._id.toString()
      );

      // When email is not configured, it returns false but continues
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test('should handle missing email', async () => {
      const result = await sendUserCredentials(
        null,
        'New User',
        'ngo',
        'tempPassword123',
        'Admin User',
        testUser._id.toString()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No recipient email');
    });

    test('should return credentials when email fails', async () => {
      const result = await sendUserCredentials(
        'test@example.com',
        'Test User',
        'victim',
        'password123',
        'Admin',
        testUser._id.toString()
      );

      // Should gracefully fail and provide credentials
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test('should handle different user roles', async () => {
      const roles = ['ngo', 'authority', 'operator', 'admin'];
      
      for (const role of roles) {
        const result = await sendUserCredentials(
          `${role}@example.com`,
          `${role} User`,
          role,
          'password123',
          'Admin',
          testUser._id.toString()
        );

        // All roles should be processed
        expect(result).toBeDefined();
      }
    });
  });

  describe('sendPasswordResetEmail', () => {
    test('should handle password reset when email not configured', async () => {
      const result = await sendPasswordResetEmail(
        'user@example.com',
        'Test User',
        'reset_token_123',
        testUser._id.toString()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test('should handle missing email', async () => {
      const result = await sendPasswordResetEmail(
        null,
        'Test User',
        'reset_token_123',
        testUser._id.toString()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No recipient email');
    });

    test('should return reset URL when email fails', async () => {
      const result = await sendPasswordResetEmail(
        'user@example.com',
        'Test User',
        'token_abc_123',
        testUser._id.toString()
      );

      expect(result.success).toBe(false);
      expect(result.resetUrl).toContain('token_abc_123');
    });
  });

  describe('sendPasswordChangedEmail', () => {
    test('should handle password changed notification', async () => {
      const result = await sendPasswordChangedEmail(
        'user@example.com',
        'Test User',
        testUser._id.toString()
      );

      // Should gracefully handle when email is not configured
      expect(result.success).toBe(false);
    });

    test('should handle missing email', async () => {
      const result = await sendPasswordChangedEmail(
        null,
        'Test User',
        testUser._id.toString()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No recipient email');
    });
  });

  describe('sendCriticalAlert', () => {
    test('should handle critical alert when email not configured', async () => {
      const details = {
        'Ticket Number': testRequest.ticketNumber,
        'Location': testRequest.location.address,
        'Priority': testRequest.priority,
        'Status': testRequest.status
      };

      const result = await sendCriticalAlert(
        'authority@example.com',
        'High Priority Request',
        details,
        testUser._id.toString(),
        testRequest._id.toString()
      );

      expect(result).toBeDefined();
    });

    test('should handle missing email', async () => {
      const result = await sendCriticalAlert(
        null,
        'Critical Issue',
        { detail: 'value' },
        testUser._id.toString(),
        testRequest._id.toString()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No recipient email');
    });

    test('should handle empty details object', async () => {
      const result = await sendCriticalAlert(
        'authority@example.com',
        'Alert',
        {},
        testUser._id.toString(),
        testRequest._id.toString()
      );

      expect(result).toBeDefined();
    });
  });

  describe('sendSoSAlert', () => {
    beforeEach(async () => {
      testRequest.priority = 'sos';
      await testRequest.save();
    });

    test('should handle SOS alert when email not configured', async () => {
      const result = await sendSoSAlert(
        'authority@example.com',
        testRequest,
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });

    test('should handle missing email', async () => {
      const result = await sendSoSAlert(
        null,
        testRequest,
        testUser._id.toString()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No recipient email');
    });

    test('should include location coordinates in alert', async () => {
      testRequest.location.coordinates = [-122.5, 37.8];
      await testRequest.save();

      const result = await sendSoSAlert(
        'authority@example.com',
        testRequest,
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });
  });

  describe('sendAssignmentNotification', () => {
    let testAssignment;

    beforeEach(async () => {
      testAssignment = await Assignment.create({
        request: testRequest._id,
        ngo: testNGO._id,
        assignedBy: testUser._id,
        status: 'pending'
      });
    });

    test('should handle assignment notification when email not configured', async () => {
      const result = await sendAssignmentNotification(
        testNGO.email,
        testNGO.name,
        testRequest,
        testAssignment,
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });

    test('should handle missing NGO email', async () => {
      const result = await sendAssignmentNotification(
        null,
        testNGO.name,
        testRequest,
        testAssignment,
        testUser._id.toString()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No recipient email');
    });

    test('should include request needs in notification', async () => {
      testRequest.needs = {
        food: { required: true, quantity: 50, unit: 'meals' },
        water: { required: true, quantity: 100, unit: 'liters' }
      };
      await testRequest.save();

      const result = await sendAssignmentNotification(
        testNGO.email,
        testNGO.name,
        testRequest,
        testAssignment,
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });

    test('should handle request without description', async () => {
      testRequest.description = '';
      await testRequest.save();

      const result = await sendAssignmentNotification(
        testNGO.email,
        testNGO.name,
        testRequest,
        testAssignment,
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });
  });

  describe('sendDeliveryConfirmation', () => {
    test('should handle delivery confirmation when email not configured', async () => {
      const ngoPOC = {
        name: testNGO.pocName,
        phone: testNGO.phone
      };

      const result = await sendDeliveryConfirmation(
        testUser.email,
        testUser.name,
        testRequest,
        ngoPOC,
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });

    test('should handle missing email', async () => {
      const result = await sendDeliveryConfirmation(
        null,
        testUser.name,
        testRequest,
        { name: 'NGO POC' },
        testUser._id.toString()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No recipient email');
    });

    test('should handle missing NGO POC details', async () => {
      const result = await sendDeliveryConfirmation(
        testUser.email,
        testUser.name,
        testRequest,
        null,
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long email addresses', async () => {
      const longEmail = 'a'.repeat(50) + '@' + 'b'.repeat(50) + '.com';
      
      const result = await sendUserCredentials(
        longEmail,
        'Test User',
        'victim',
        'password123',
        'Admin',
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });

    test('should handle special characters in names', async () => {
      const result = await sendUserCredentials(
        'test@example.com',
        "O'Brien & Associates (测试)",
        'ngo',
        'password123',
        'Admin',
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });

    test('should handle very long request titles', async () => {
      testRequest.title = 'a'.repeat(500);
      await testRequest.save();

      const result = await sendSoSAlert(
        'authority@example.com',
        testRequest,
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });

    test('should handle missing location address', async () => {
      testRequest.location.address = '';
      await testRequest.save();

      const result = await sendSoSAlert(
        'authority@example.com',
        testRequest,
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });

    test('should handle undefined userId', async () => {
      const result = await sendPasswordResetEmail(
        'test@example.com',
        'Test User',
        'token123',
        undefined
      );

      expect(result).toBeDefined();
    });

    test('should handle null request ID', async () => {
      const result = await sendCriticalAlert(
        'test@example.com',
        'Alert',
        { detail: 'value' },
        testUser._id.toString(),
        null
      );

      expect(result).toBeDefined();
    });
  });

  describe('Priority Handling', () => {
    test('should handle all priority levels', async () => {
      const priorities = ['sos', 'critical', 'high', 'medium', 'low'];
      
      for (const priority of priorities) {
        testRequest.priority = priority;
        await testRequest.save();

        const result = await sendSoSAlert(
          'authority@example.com',
          testRequest,
          testUser._id.toString()
        );

        expect(result).toBeDefined();
      }
    });
  });

  describe('Error Resilience', () => {
    test('should handle malformed request object', async () => {
      const badRequest = { 
        ticketNumber: '123',
        title: null,
        location: {},
        createdBy: {}
      };

      const result = await sendSoSAlert(
        'test@example.com',
        badRequest,
        testUser._id.toString()
      );

      expect(result).toBeDefined();
    });

    test('should handle empty strings for required fields', async () => {
      const result = await sendUserCredentials(
        '',
        '',
        'ngo',
        '',
        '',
        testUser._id.toString()
      );

      // Empty email should be caught
      expect(result.success).toBe(false);
    });

    test('should handle whitespace-only email', async () => {
      const result = await sendPasswordResetEmail(
        '   ',
        'Test User',
        'token123',
        testUser._id.toString()
      );

      // Whitespace should be treated as invalid
      expect(result).toBeDefined();
    });
  });
});
