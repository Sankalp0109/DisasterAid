import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User } from '../models/User.js';

dotenv.config();

const insertAdmin = async () => {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/disaster_aid');
    console.log('✅ Connected to MongoDB (disaster_aid database)');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'test@admin.com' });
    
    if (existingAdmin) {
      console.log('⚠️  Admin user with email test@admin.com already exists!');
      console.log('📊 Existing Admin:', {
        id: existingAdmin._id,
        name: existingAdmin.name,
        email: existingAdmin.email,
        role: existingAdmin.role,
        isActive: existingAdmin.isActive
      });
      
      // Ask user if they want to update
      console.log('\nℹ️  To update this user, please delete it first or modify the script.');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Hash password manually
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password', salt);

    // Create admin object
    const adminUser = new User({
      name: 'siddardha',
      email: 'test@admin.com',
      password: hashedPassword,  // Will be hashed again by pre-save hook, but that's okay
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

    // Save to database
    const savedAdmin = await adminUser.save();
    
    console.log('✅ Platform Admin Created Successfully!');
    console.log('\n📋 Admin Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`ID:       ${savedAdmin._id}`);
    console.log(`Name:     ${savedAdmin.name}`);
    console.log(`Email:    ${savedAdmin.email}`);
    console.log(`Role:     ${savedAdmin.role}`);
    console.log(`Verified: ${savedAdmin.isVerified}`);
    console.log(`Active:   ${savedAdmin.isActive}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n🔐 Login Credentials:');
    console.log(`📧 Email:    test@admin.com`);
    console.log(`🔑 Password: password`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Close connection
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error inserting admin user:', error.message);
    if (error.response?.data) {
      console.error('📊 Error Details:', error.response.data);
    }
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the script
insertAdmin();
