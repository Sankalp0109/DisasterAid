import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { NGO } from '../models/NGO.js';
import { Offer } from '../models/Offer.js';
import { Request } from '../models/Request.js';
import { Assignment } from '../models/Assignment.js';
import { Shelter } from '../models/Shelter.js';
import { RequestCluster } from '../models/RequestCluster.js';
import { AuditLog } from '../models/AuditLog.js';

async function main() {
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGO_URL or MONGODB_URI');
  await mongoose.connect(uri);
  const counts = {
    users: await User.countDocuments(),
    ngos: await NGO.countDocuments(),
    offers: await Offer.countDocuments(),
    requests: await Request.countDocuments(),
    assignments: await Assignment.countDocuments(),
    shelters: await Shelter.countDocuments(),
    clusters: await RequestCluster.countDocuments(),
    logs: await AuditLog.countDocuments(),
  };
  console.table(counts);
  console.log(JSON.stringify(counts));
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
