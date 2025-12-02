import mongoose from 'mongoose';
import { User } from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/disaster_aid');
    console.log('✅ Connected to database');

    const admin = await User.findOne({ email: 'test@admin.com' });
    
    if (admin) {
      console.log('\n✅ Admin user found:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Email:', admin.email);
      console.log('Name:', admin.name);
      console.log('Role:', admin.role);
      console.log('Verified:', admin.isVerified);
      console.log('Active:', admin.isActive);
      console.log('Has password hash:', !!admin.password);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Test password comparison
      const isPasswordCorrect = await admin.comparePassword('password');
      console.log('\n🔐 Password test:');
      console.log('Password "password" matches:', isPasswordCorrect ? '✅ YES' : '❌ NO');
    } else {
      console.log('❌ Admin not found with email: test@admin.com');
      console.log('\nAll users in database:');
      const allUsers = await User.find({}, { email: 1, role: 1, name: 1 });
      allUsers.forEach(u => console.log(`  - ${u.email} (${u.role})`));
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAdmin();
