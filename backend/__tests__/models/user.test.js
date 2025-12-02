import { User } from '../../models/User.js';
import bcrypt from 'bcryptjs';

describe('User Model Tests', () => {
  describe('User Creation', () => {
    test('should create a user with valid data', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'victim',
        phoneNumber: '+1234567890'
      };

      const user = await User.create(userData);

      expect(user.name).toBe(userData.name);
      expect(user.email).toBe(userData.email);
      expect(user.role).toBe(userData.role);
      expect(user.phoneNumber).toBe(userData.phoneNumber);
      expect(user._id).toBeDefined();
    });

    test('should hash password before saving', async () => {
      const userData = {
        name: 'Test User',
        email: 'test2@example.com',
        password: 'password123',
        role: 'victim'
      };

      const user = await User.create(userData);

      expect(user.password).not.toBe(userData.password);
      expect(user.password.length).toBeGreaterThan(20);
      
      const isMatch = await bcrypt.compare(userData.password, user.password);
      expect(isMatch).toBe(true);
    });

    test('should fail without required fields', async () => {
      const invalidUser = {
        name: 'Test User'
        // Missing email, password, role
      };

      await expect(User.create(invalidUser)).rejects.toThrow();
    });

    test('should fail with invalid email format', async () => {
      const userData = {
        name: 'Test User',
        email: 'invalid-email',
        password: 'password123',
        role: 'victim'
      };

      await expect(User.create(userData)).rejects.toThrow();
    });

    test('should fail with duplicate email', async () => {
      const userData = {
        name: 'Test User',
        email: 'duplicate@example.com',
        password: 'password123',
        role: 'victim'
      };

      await User.create(userData);
      await expect(User.create(userData)).rejects.toThrow();
    });

    test('should validate role enum', async () => {
      const userData = {
        name: 'Test User',
        email: 'test3@example.com',
        password: 'password123',
        role: 'invalid_role'
      };

      await expect(User.create(userData)).rejects.toThrow();
    });

    test('should create user with all valid roles', async () => {
      const roles = ['victim', 'ngo', 'authority', 'operator', 'admin'];

      for (let i = 0; i < roles.length; i++) {
        const user = await User.create({
          name: `User ${i}`,
          email: `user${i}@example.com`,
          password: 'password123',
          role: roles[i]
        });

        expect(user.role).toBe(roles[i]);
      }
    });
  });

  describe('User Methods', () => {
    test('comparePassword should return true for correct password', async () => {
      const userData = {
        name: 'Test User',
        email: 'test4@example.com',
        password: 'password123',
        role: 'victim'
      };

      const user = await User.create(userData);
      const isMatch = await user.comparePassword('password123');

      expect(isMatch).toBe(true);
    });

    test('comparePassword should return false for incorrect password', async () => {
      const userData = {
        name: 'Test User',
        email: 'test5@example.com',
        password: 'password123',
        role: 'victim'
      };

      const user = await User.create(userData);
      const isMatch = await user.comparePassword('wrongpassword');

      expect(isMatch).toBe(false);
    });
  });

  describe('User Fields Validation', () => {
    test('should handle optional phoneNumber', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test6@example.com',
        password: 'password123',
        role: 'victim'
      });

      expect(user.phoneNumber).toBeUndefined();
    });

    test('should default isVerified to false', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test7@example.com',
        password: 'password123',
        role: 'ngo'
      });

      expect(user.isVerified).toBe(false);
    });

    test('should allow setting isVerified to true', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test8@example.com',
        password: 'password123',
        role: 'ngo',
        isVerified: true
      });

      expect(user.isVerified).toBe(true);
    });

    test('should handle organizationId for NGO users', async () => {
      const user = await User.create({
        name: 'NGO User',
        email: 'ngo@example.com',
        password: 'password123',
        role: 'ngo'
      });

      expect(user.organizationId).toBeUndefined();

      // Set organizationId
      user.organizationId = '507f1f77bcf86cd799439011';
      await user.save();

      expect(user.organizationId).toBeDefined();
    });

    test('should handle resetPasswordToken and expiry', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test9@example.com',
        password: 'password123',
        role: 'victim'
      });

      const token = 'reset_token_123';
      const expiry = Date.now() + 3600000;

      user.resetPasswordToken = token;
      user.resetPasswordExpires = expiry;
      await user.save();

      expect(user.resetPasswordToken).toBe(token);
      expect(user.resetPasswordExpires).toBeGreaterThan(Date.now());
    });
  });

  describe('User Edge Cases', () => {
    test('should trim whitespace from email', async () => {
      const user = await User.create({
        name: 'Test User',
        email: '  test10@example.com  ',
        password: 'password123',
        role: 'victim'
      });

      expect(user.email).toBe('test10@example.com');
    });

    test('should handle very long names', async () => {
      const longName = 'A'.repeat(200);
      const user = await User.create({
        name: longName,
        email: 'test11@example.com',
        password: 'password123',
        role: 'victim'
      });

      expect(user.name).toBe(longName);
    });

    test('should handle special characters in name', async () => {
      const user = await User.create({
        name: "O'Brien-Smith",
        email: 'test12@example.com',
        password: 'password123',
        role: 'victim'
      });

      expect(user.name).toBe("O'Brien-Smith");
    });

    test('should handle international phone numbers', async () => {
      const phoneNumbers = [
        '+14155552671',
        '+442071838750',
        '+919876543210',
        '+86123456789'
      ];

      for (let i = 0; i < phoneNumbers.length; i++) {
        const user = await User.create({
          name: `User ${i}`,
          email: `intl${i}@example.com`,
          password: 'password123',
          role: 'victim',
          phoneNumber: phoneNumbers[i]
        });

        expect(user.phoneNumber).toBe(phoneNumbers[i]);
      }
    });
  });

  describe('User Query Tests', () => {
    beforeEach(async () => {
      await User.create([
        { name: 'User 1', email: 'user1@test.com', password: 'pass123', role: 'victim' },
        { name: 'User 2', email: 'user2@test.com', password: 'pass123', role: 'ngo', isVerified: true },
        { name: 'User 3', email: 'user3@test.com', password: 'pass123', role: 'authority' },
        { name: 'User 4', email: 'user4@test.com', password: 'pass123', role: 'admin' }
      ]);
    });

    test('should find user by email', async () => {
      const user = await User.findOne({ email: 'user1@test.com' });
      expect(user).toBeDefined();
      expect(user.name).toBe('User 1');
    });

    test('should find users by role', async () => {
      const victims = await User.find({ role: 'victim' });
      expect(victims).toHaveLength(1);
      expect(victims[0].role).toBe('victim');
    });

    test('should find verified users', async () => {
      const verified = await User.find({ isVerified: true });
      expect(verified).toHaveLength(1);
      expect(verified[0].email).toBe('user2@test.com');
    });

    test('should count users by role', async () => {
      const count = await User.countDocuments({ role: 'ngo' });
      expect(count).toBe(1);
    });
  });
});
