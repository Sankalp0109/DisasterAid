/**
 * Script to create Authority or Admin users
 * 
 * Usage:
 *   node backend/scripts/createAuthorityUser.js
 *   node backend/scripts/createAuthorityUser.js --role=admin --email=admin@company.com --name="Admin Name"
 * 
 * This bypasses the registration restriction for privileged roles.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import readline from 'readline';
import { User } from '../models/User.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Parse command line arguments
function getArg(name, defaultValue) {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  if (arg) {
    return arg.split('=')[1];
  }
  return defaultValue;
}

async function connectDB() {
  const uri = process.env.MONGO_URL || "mongodb://localhost:27017/disaster_aid";
  if (!uri) {
    throw new Error('❌ Set MONGO_URL or MONGODB_URI in your .env file');
  }
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB\n');
}

async function createUser(userData) {
  // Check if user already exists
  const existing = await User.findOne({ email: userData.email.toLowerCase() });
  if (existing) {
    console.log(`❌ User with email ${userData.email} already exists!`);
    return null;
  }

  // Set permissions based on role
  let permissions = {};
  if (userData.role === 'authority') {
    permissions = {
      canTriage: true,
      canAssign: true,
      canVerify: true,
      canManageShelters: true,
      canViewAnalytics: true,
      canExportData: true,
    };
  } else if (userData.role === 'admin') {
    permissions = {
      canTriage: true,
      canAssign: true,
      canVerify: true,
      canManageShelters: true,
      canViewAnalytics: true,
      canExportData: true,
      canManageRoles: true,
      canManageDataRetention: true,
      canExportIncidents: true,
    };
  }

  // Create user
  const user = new User({
    name: userData.name,
    email: userData.email.toLowerCase(),
    password: userData.password,
    countryCode: userData.countryCode || '+91',
    phone: userData.phone || '',
    role: userData.role,
    permissions,
    isVerified: true, // Auto-verify authority/admin users
    isActive: true,
  });

  await user.save();
  return user;
}

async function interactiveMode() {
  console.log('='.repeat(60));
  console.log('🔐 Create Authority/Admin User - Interactive Mode');
  console.log('='.repeat(60));
  console.log();

  const name = await question('Enter full name: ');
  const email = await question('Enter email: ');
  const password = await question('Enter password (min 6 chars): ');
  const phone = await question('Enter phone (optional, press Enter to skip): ');
  
  let role;
  while (true) {
    role = await question('Enter role (authority/admin): ').then(r => r.toLowerCase());
    if (role === 'authority' || role === 'admin') break;
    console.log('❌ Invalid role. Please enter "authority" or "admin"');
  }

  const userData = {
    name,
    email,
    password,
    phone: phone || undefined,
    role
  };

  console.log('\n📋 Creating user with:');
  console.log(JSON.stringify(userData, null, 2));
  console.log();

  const confirm = await question('Proceed? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('❌ Cancelled');
    return null;
  }

  return await createUser(userData);
}

async function main() {
  try {
    await connectDB();

    // Check if command line arguments are provided
    const email = getArg('email');
    const name = getArg('name');
    const password = getArg('password', 'password');
    const role = getArg('role', 'authority');
    const phone = getArg('phone');

    let user;

    if (email && name) {
      // Non-interactive mode with command line args
      console.log('🔐 Creating user from command line arguments...\n');
      user = await createUser({ email, name, password, role, phone });
    } else {
      // Interactive mode
      user = await interactiveMode();
    }

    if (user) {
      console.log('\n✅ User created successfully!');
      console.log('='.repeat(60));
      console.log('📧 Email:', user.email);
      console.log('👤 Name:', user.name);
      console.log('🔑 Role:', user.role);
      console.log('✓ Verified:', user.isVerified);
      console.log('🔓 Permissions:', JSON.stringify(user.permissions, null, 2));
      console.log('='.repeat(60));
      console.log('\n🎉 You can now login with these credentials!');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

main();
