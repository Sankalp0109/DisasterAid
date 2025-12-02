import request from 'supertest';
import express from 'express';
import { User } from '../../models/User.js';
import authRoutes from '../../routes/auth.js';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Authentication Controller Tests', () => {
  describe('POST /api/auth/register - User Registration', () => {
    test('should register a new victim user', async () => {
      const userData = {
        name: 'Test Victim',
        email: 'victim@test.com',
        password: 'password123',
        phoneNumber: '+1234567890'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('registered');
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.role).toBe('victim');
      expect(response.body.user.password).toBeUndefined();
      expect(response.body.token).toBeDefined();

      // Verify JWT token
      const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
      expect(decoded.userId).toBeDefined();
      expect(decoded.role).toBe('victim');
    });

    test('should fail registration with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User'
          // Missing email, password
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should fail registration with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'invalid-email',
          password: 'password123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should fail registration with short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: '123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should fail registration with duplicate email', async () => {
      const userData = {
        name: 'Test User',
        email: 'duplicate@test.com',
        password: 'password123'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    test('should handle registration with special characters in name', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: "O'Brien-Smith Jr.",
          email: 'special@test.com',
          password: 'password123'
        })
        .expect(201);

      expect(response.body.user.name).toBe("O'Brien-Smith Jr.");
    });
  });

  describe('POST /api/auth/login - User Login', () => {
    beforeEach(async () => {
      await User.create({
        name: 'Test User',
        email: 'login@test.com',
        password: 'password123',
        role: 'victim'
      });
    });

    test('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@test.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('login@test.com');
      expect(response.body.user.password).toBeUndefined();
    });

    test('should fail login with incorrect password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@test.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid');
    });

    test('should fail login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should fail login with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@test.com'
          // Missing password
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle case-insensitive email login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'LOGIN@TEST.COM',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/auth/forgot-password - Password Reset Request', () => {
    beforeEach(async () => {
      await User.create({
        name: 'Test User',
        email: 'reset@test.com',
        password: 'password123',
        role: 'victim'
      });
    });

    test('should send password reset email', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'reset@test.com'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('sent');

      // Verify reset token was saved
      const user = await User.findOne({ email: 'reset@test.com' });
      expect(user.resetPasswordToken).toBeDefined();
      expect(user.resetPasswordExpires).toBeGreaterThan(Date.now());
    });

    test('should fail with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'nonexistent@test.com'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should fail with missing email', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/reset-password - Password Reset', () => {
    let resetToken;
    let user;

    beforeEach(async () => {
      user = await User.create({
        name: 'Test User',
        email: 'resetpass@test.com',
        password: 'oldpassword123',
        role: 'victim'
      });

      // Generate reset token
      resetToken = 'test_reset_token_' + Date.now();
      const crypto = await import('crypto');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      
      user.resetPasswordToken = resetTokenHash;
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
      await user.save();
    });

    test('should reset password with valid token', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'newpassword123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('reset');

      // Verify can login with new password
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'resetpass@test.com',
          password: 'newpassword123'
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
    });

    test('should fail with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'invalid_token',
          newPassword: 'newpassword123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should fail with expired token', async () => {
      user.resetPasswordExpires = Date.now() - 1000; // Expired
      await user.save();

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'newpassword123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('expired');
    });

    test('should fail with short new password', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: '123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/change-password - Password Change', () => {
    let token;
    let userId;

    beforeEach(async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'changepass@test.com',
        password: 'oldpassword123',
        role: 'victim'
      });

      userId = user._id;
      token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
    });

    test('should change password with correct old password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: 'oldpassword123',
          newPassword: 'newpassword123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify can login with new password
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'changepass@test.com',
          password: 'newpassword123'
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
    });

    test('should fail with incorrect old password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: 'wrongpassword',
          newPassword: 'newpassword123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('incorrect');
    });

    test('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .send({
          oldPassword: 'oldpassword123',
          newPassword: 'newpassword123'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should fail with short new password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: 'oldpassword123',
          newPassword: '123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should fail when new password same as old', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: 'oldpassword123',
          newPassword: 'oldpassword123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('JWT Token Edge Cases', () => {
    test('should fail with expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: '507f1f77bcf86cd799439011', role: 'victim' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          oldPassword: 'old',
          newPassword: 'new123'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should fail with malformed token', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', 'Bearer invalid.token.here')
        .send({
          oldPassword: 'old',
          newPassword: 'new123'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should fail with missing Bearer prefix', async () => {
      const token = jwt.sign(
        { userId: '507f1f77bcf86cd799439011', role: 'victim' },
        process.env.JWT_SECRET
      );

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', token)
        .send({
          oldPassword: 'old',
          newPassword: 'new123'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
