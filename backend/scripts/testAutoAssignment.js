// Simple test script to exercise auto-assignment logic.
// Run with: node backend/scripts/testAutoAssignment.js (ensure Mongo + env loaded)
import "dotenv/config";
import mongoose from "mongoose";
import { Request } from "../models/Request.js";
import { NGO } from "../models/NGO.js";
import { enqueueAutoAssignment, getQueueSnapshot } from "../services/autoAssignmentService.js";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  // Create a sample NGO if none exists
  let ngo = await NGO.findOne({ email: "demo-ngo@test.com" });
  if (!ngo) {
    ngo = await NGO.create({
      name: "Demo Rescue NGO",
      email: "demo-ngo@test.com",
      phone: "+91-9999999999",
      location: { type: "Point", coordinates: [77.5946, 12.9716] },
      capabilities: { rescue: true, medical: true, water: true },
      isActive: true,
      isVerified: true,
      isOnline: true,
      available24x7: true,
    });
    console.log("Created demo NGO", ngo._id);
  }

  // Insert multiple requests with varying priorities
  const priorities = ["low", "medium", "high", "critical", "sos"];
  const createdIds = [];
  for (const p of priorities) {
    const req = await Request.create({
      submittedBy: ngo.adminUser || ngo._id, // Fake user reference for test
      location: { type: "Point", coordinates: [77.60 + Math.random() * 0.01, 12.97 + Math.random() * 0.01] },
      needs: { rescue: { required: true, urgency: p === "low" ? "low" : "critical" } },
      priority: p,
      status: "new",
    });
    createdIds.push(req._id);
    enqueueAutoAssignment(req._id, p);
    console.log("Enqueued request", req._id.toString(), "priority", p);
  }

  // Poll queue snapshot for a short period
  const start = Date.now();
  while (Date.now() - start < 8000) {
    console.log("Queue snapshot", getQueueSnapshot());
    await new Promise(r => setTimeout(r, 1500));
  }

  // Fetch updated requests to see assignment status
  const updated = await Request.find({ _id: { $in: createdIds } }).populate("assignments");
  updated.forEach(r => {
    console.log(`Request ${r._id} priority=${r.priority} status=${r.status} assignments=${r.assignments.length}`);
  });

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
