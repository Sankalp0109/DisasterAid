import 'dotenv/config';
import mongoose from 'mongoose';
import { NGO } from '../models/NGO.js';
import { User } from '../models/User.js';

async function fixNGO() {
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGO_URL or MONGODB_URI');
  await mongoose.connect(uri);

  console.log('\n=== FIXING NGO DATA ===\n');

  // Find the red cross NGO
  const ngo = await NGO.findOne({ name: 'red cross' });
  
  if (!ngo) {
    console.log('NGO "red cross" not found');
    await mongoose.disconnect();
    return;
  }

  console.log('Found NGO:', ngo.name);
  console.log('Current location:', ngo.location?.coordinates);

  // Update with proper Hyderabad location (where the request is)
  ngo.location = {
    type: 'Point',
    coordinates: [78.4867, 17.3850], // Hyderabad center
    address: 'Hyderabad, Telangana'
  };

  // Note: capabilities are now derived from Offers, not stored in NGO
  // Set proper status values
  ngo.isActive = true;
  ngo.isVerified = true;
  ngo.isOnline = true;
  ngo.maxActiveRequests = 50;
  ngo.activeRequests = 0;
  ngo.maxActiveAssignments = 50;
  ngo.activeAssignments = 0;
  ngo.coverageRadius = 50000; // 50km

  // Set stats if not present
  if (!ngo.stats) {
    ngo.stats = {};
  }
  ngo.stats.rating = 4.5;
  ngo.stats.totalAssignments = 0;
  ngo.stats.completedAssignments = 0;
  ngo.stats.averageResponseTime = 30;

  await ngo.save();

  console.log('\n✅ NGO Updated:');
  console.log('New location:', ngo.location.coordinates);
  console.log('Online:', ngo.isOnline);
  console.log('Active requests:', ngo.activeRequests, '/', ngo.maxActiveRequests);
  console.log('\n⚠️ Note: Create Offers for this NGO to define its capabilities and inventory');

  await mongoose.disconnect();
  console.log('\n✅ Done! NGO should now be matchable.');
}

fixNGO().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
