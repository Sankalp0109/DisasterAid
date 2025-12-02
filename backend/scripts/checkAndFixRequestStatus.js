import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Request } from '../models/Request.js';
import { Assignment } from '../models/Assignment.js';

dotenv.config();

async function checkAndFixRequests() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find requests with assigned status that have in-progress assignments
    const requests = await Request.find()
      .populate({
        path: 'assignments',
        select: 'status'
      })
      .lean();

    console.log(`\n📋 Found ${requests.length} total requests\n`);

    let needsUpdate = 0;

    for (const req of requests) {
      if (req.status === 'assigned' && req.assignments && req.assignments.length > 0) {
        const hasInProgress = req.assignments.some(a => a.status === 'in-progress');
        
        if (hasInProgress) {
          console.log(`⚠️  Request #${req.ticketNumber} (${req._id})`);
          console.log(`   Current status: ${req.status}`);
          console.log(`   Assignments: ${req.assignments.map(a => a.status).join(', ')}`);
          console.log(`   → Should be: in-progress`);
          needsUpdate++;
        }
      }
    }

    console.log(`\n🔍 Found ${needsUpdate} requests that need status correction\n`);

    if (needsUpdate > 0) {
      console.log('🔧 Fixing mismatched statuses...\n');
      
      for (const req of requests) {
        if (req.status === 'assigned' && req.assignments && req.assignments.length > 0) {
          const hasInProgress = req.assignments.some(a => a.status === 'in-progress');
          
          if (hasInProgress) {
            await Request.updateOne(
              { _id: req._id },
              { 
                status: 'in-progress',
                $push: {
                  timeline: {
                    action: 'in-progress',
                    performedBy: null,
                    details: 'Status corrected: assignment in-progress'
                  }
                }
              }
            );
            
            console.log(`✅ Fixed Request #${req.ticketNumber}: assigned → in-progress`);
          }
        }
      }
    }

    console.log('\n✅ Check complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

checkAndFixRequests();
