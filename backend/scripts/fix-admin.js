import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function fixAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/disaster_aid');
    console.log('🔌 Connected to database');

    // Delete existing admin
    const deleted = await User.deleteOne({ email: 'test@admin.com' });
    console.log(`🗑️  Deleted ${deleted.deletedCount} existing admin(s)`);

    // Create new admin with plain password (will be hashed by pre-save hook)
    const adminUser = new User({
      name: 'siddardha',
      email: 'test@admin.com',
      password: 'password',  // Plain password - will be hashed by pre-save hook
      role: 'admin',
      countryCode: '+91',
      phone: '',
      isVerified: true,
      isActive: true,
      permissions: {
        canTriage: true,
        canAssign: true,
        canVerify: true,
        canManageShelters: true,
        canViewAnalytics: true,
        canExportData: true,
        canManageRoles: true,
        canManageDataRetention: true,
        canExportIncidents: true,
      }
    });

    // Save (will trigger pre-save hook to hash password)
    const savedAdmin = await adminUser.save();
    console.log('\n✅ Admin recreated successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Email:', savedAdmin.email);
    console.log('Name:', savedAdmin.name);
    console.log('Role:', savedAdmin.role);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Verify password works
    const testPassword = await savedAdmin.comparePassword('password');
    console.log('\n🔐 Password verification:');
    console.log('Password "password" works:', testPassword ? '✅ YES' : '❌ NO');
    
    console.log('\n📧 Login Credentials:');
    console.log('Email:    test@admin.com');
    console.log('Password: password');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixAdmin();
