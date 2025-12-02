import 'dotenv/config';
import mongoose from 'mongoose';
import { Request } from '../models/Request.js';
import { NGO } from '../models/NGO.js';
import { Assignment } from '../models/Assignment.js';
import { Offer } from '../models/Offer.js';

async function main() {
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGO_URL or MONGODB_URI');
  await mongoose.connect(uri);

  console.log('\n=== CHECKING UNASSIGNED REQUESTS ===\n');
  
  const requests = await Request.find({
    status: { $in: ['new', 'triaged'] }
  }).select('status priority location needs assignments createdAt').lean();
  
  console.log(`Found ${requests.length} unassigned requests:\n`);
  
  for (const req of requests) {
    console.log(`Request ID: ${req._id}`);
    console.log(`Status: ${req.status}`);
    console.log(`Priority: ${req.priority}`);
    console.log(`Location: ${JSON.stringify(req.location?.coordinates)}`);
    console.log(`Has coordinates: ${Array.isArray(req.location?.coordinates) && req.location.coordinates.length === 2}`);
    console.log(`Needs: ${JSON.stringify(req.needs)}`);
    console.log(`Assignments count: ${req.assignments?.length || 0}`);
    console.log(`Created: ${req.createdAt}`);
    console.log('---\n');
  }

  console.log('\n=== CHECKING AVAILABLE NGOs ===\n');
  
  const ngos = await NGO.find({ isActive: true })
    .select('name location isOnline activeRequests maxActiveRequests activeAssignments maxActiveAssignments')
    .lean();
  
  console.log(`Found ${ngos.length} active NGOs:\n`);
  
  for (const ngo of ngos) {
    console.log(`NGO: ${ngo.name}`);
    console.log(`ID: ${ngo._id}`);
    console.log(`Location: ${JSON.stringify(ngo.location?.coordinates)}`);
    console.log(`Has coordinates: ${Array.isArray(ngo.location?.coordinates) && ngo.location.coordinates.length === 2}`);
    console.log(`Online: ${ngo.isOnline}`);
    console.log(`Active requests: ${ngo.activeRequests}/${ngo.maxActiveRequests}`);
    console.log(`Active assignments: ${ngo.activeAssignments}/${ngo.maxActiveAssignments}`);
    
    // Get active offers to show capabilities and capacity
    const offers = await Offer.find({
      offeredBy: ngo._id,
      status: 'active',
      availableQuantity: { $gt: 0 }
    }).select('category totalQuantity availableQuantity').lean();
    
    const capabilities = [...new Set(offers.map(o => o.category))];
    const totalAvailable = offers.reduce((sum, o) => sum + o.availableQuantity, 0);
    const totalCapacity = offers.reduce((sum, o) => sum + o.totalQuantity, 0);
    const capacityPercent = totalCapacity > 0 ? ((totalAvailable / totalCapacity) * 100).toFixed(1) : 0;
    
    console.log(`Capabilities (from ${offers.length} active offers): ${capabilities.join(', ') || 'none'}`);
    console.log(`Capacity (from offers): ${capacityPercent}% (${totalAvailable}/${totalCapacity})`);
    console.log('---\n');
  }

  console.log('\n=== CHECKING EXISTING ASSIGNMENTS ===\n');
  
  const assignments = await Assignment.find()
    .select('request assignedTo status priority createdAt')
    .populate('request', 'status')
    .populate('assignedTo', 'name')
    .lean();
  
  console.log(`Found ${assignments.length} assignments:\n`);
  
  for (const assignment of assignments) {
    console.log(`Assignment ID: ${assignment._id}`);
    console.log(`Request ID: ${assignment.request?._id || assignment.request}`);
    console.log(`Request Status: ${assignment.request?.status || 'N/A'}`);
    console.log(`NGO: ${assignment.assignedTo?.name || assignment.assignedTo}`);
    console.log(`Status: ${assignment.status}`);
    console.log(`Created: ${assignment.createdAt}`);
    console.log('---\n');
  }

  // Test distance calculation
  if (requests.length > 0 && ngos.length > 0) {
    const req = requests[0];
    const ngo = ngos[0];
    
    if (req.location?.coordinates && ngo.location?.coordinates) {
      const [reqLon, reqLat] = req.location.coordinates;
      const [ngoLon, ngoLat] = ngo.location.coordinates;
      
      // Haversine formula
      const R = 6371e3; // Earth radius in meters
      const φ1 = (reqLat * Math.PI) / 180;
      const φ2 = (ngoLat * Math.PI) / 180;
      const Δφ = ((ngoLat - reqLat) * Math.PI) / 180;
      const Δλ = ((ngoLon - reqLon) * Math.PI) / 180;

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      
      console.log('\n=== DISTANCE TEST ===\n');
      console.log(`Distance between first request and first NGO: ${(distance / 1000).toFixed(2)} km`);
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
