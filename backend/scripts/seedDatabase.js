/*
  Seed script to generate dummy data across all collections for local testing.
  Usage:
    node backend/scripts/seedDatabase.js [--purge] [--requests=50] [--ngos=5] [--victims=10]

  Env:
    MONGO_URL or MONGODB_URI must be set, or .env present at project root.
*/
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
import { autoMatchRequest } from '../services/matchingService.js';

// ---------- helpers ----------
const arg = (name, def = undefined) => {
  const key = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!key) return def;
  const [, value] = key.split('=');
  return value;
};
const hasFlag = (name) => process.argv.includes(`--${name}`);

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Bangalore base (lon, lat)
const BASE = { lon: 77.5946, lat: 12.9716 };
function jitterCoord(base, meters = 2000) { // random point within ~meters radius
  const r = meters / 111300; // deg approx
  const u = Math.random();
  const v = Math.random();
  const w = r * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const x = w * Math.cos(t);
  const y = w * Math.sin(t);
  const lat = base.lat + y;
  const lon = base.lon + x / Math.cos(base.lat * (Math.PI / 180));
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
}

const PRIORITIES = ['low', 'medium', 'high', 'critical', 'sos'];
const NEED_KEYS = ['rescue', 'food', 'water', 'medical', 'shelter', 'transport'];
const CATEGORIES = ['rescue', 'food', 'water', 'medical', 'babySupplies', 'sanitation', 'shelter', 'power', 'transport'];

async function connect() {
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGO_URL or MONGODB_URI');
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');
}

async function purgeAll() {
  console.log('⚠️  Purging collections...');
  const models = [User, NGO, Offer, Request, Assignment, Shelter, RequestCluster, AuditLog];
  for (const m of models) {
    try { await m.deleteMany({}); } catch {}
  }
}

function buildPermissions(role) {
  if (role === 'operator') return { canTriage: true, canAssign: true, canViewAnalytics: true };
  if (role === 'authority') return { canTriage: true, canAssign: true, canVerify: true, canManageShelters: true, canViewAnalytics: true, canExportData: true };
  if (role === 'admin') return { canTriage: true, canAssign: true, canVerify: true, canManageShelters: true, canViewAnalytics: true, canExportData: true };
  return {};
}

async function createCoreUsers() {
  const admin = await User.create({
    name: 'Admin User', email: 'admin@test.com', password: 'password', role: 'admin',
    permissions: buildPermissions('admin'), isVerified: true,
  });
  const operator = await User.create({
    name: 'Operator One', email: 'operator@test.com', password: 'password', role: 'operator',
    permissions: buildPermissions('operator'), isVerified: true,
  });
  const authority = await User.create({
    name: 'Authority One', email: 'authority@test.com', password: 'password', role: 'authority',
    permissions: buildPermissions('authority'), isVerified: true,
  });
  return { admin, operator, authority };
}

async function createNGOs(count = 5) {
  const ngos = [];
  for (let i = 0; i < count; i++) {
    const [lon, lat] = jitterCoord(BASE, 15000);
    const ngoUser = await User.create({
      name: `NGO Admin ${i + 1}`,
      email: `ngo${i + 1}@test.com`,
      password: 'password',
      role: 'ngo',
      isVerified: true,
    });
    // Note: capabilities are now derived from Offers, not stored in NGO
    const ngo = await NGO.create({
      name: `Relief Org ${i + 1}`,
      email: `ngo${i + 1}@test.com`,
      phone: `+91-90000${String(1000 + i)}`,
      adminUser: ngoUser._id,
      location: { type: 'Point', coordinates: [lon, lat], address: 'Bangalore' },
      isActive: true,
      isVerified: true,
      isOnline: Math.random() < 0.8,
      available24x7: Math.random() < 0.3,
      maxActiveAssignments: randomInt(20, 100),
      stats: {
        rating: Number((Math.random() * 2 + 3).toFixed(1)),
        totalAssignments: randomInt(5, 200),
        completedAssignments: randomInt(5, 180),
        averageResponseTime: randomInt(5, 90),
      },
    });
    ngoUser.organizationId = ngo._id;
    await ngoUser.save();
    ngos.push(ngo);
  }
  return ngos;
}

async function createVictims(count = 10) {
  const victims = [];
  for (let i = 0; i < count; i++) {
    victims.push(await User.create({
      name: `Victim ${i + 1}`,
      email: `victim${i + 1}@test.com`,
      password: 'password',
      role: 'victim',
      isVerified: true,
    }));
  }
  return victims;
}

async function createOffers(ngos) {
  const offers = [];
  for (const ngo of ngos) {
    // Create 2-4 random offers per NGO from available categories
    // This defines what the NGO can actually provide
    const numOffers = randomInt(2, 4);
    const selectedCategories = [];
    for (let i = 0; i < numOffers; i++) {
      // Pick unique categories
      let category;
      do {
        category = pick(CATEGORIES);
      } while (selectedCategories.includes(category) && selectedCategories.length < CATEGORIES.length);
      selectedCategories.push(category);
      
      const [lon, lat] = jitterCoord({ lon: ngo.location.coordinates[0], lat: ngo.location.coordinates[1] }, 8000);
      const total = randomInt(20, 200);
      const available = randomInt(10, total);
      const offer = await Offer.create({
        offeredBy: ngo._id,
        title: `${category.toUpperCase()} support - ${ngo.name}`,
        description: `We can provide ${category} assistance`.
          concat(category === 'food' ? ' (veg meals available)' : ''),
        category,
        totalQuantity: total,
        availableQuantity: available,
        unit: 'units',
        location: { type: 'Point', coordinates: [lon, lat], address: 'Nearby Area' },
        coverageRadius: randomInt(5000, 30000),
        status: 'active',
        isVerified: Math.random() < 0.9,
      });
      offers.push(offer);
    }
  }
  return offers;
}

function randomNeeds() {
  const needs = {};
  for (const key of NEED_KEYS) {
    const reqd = Math.random() < 0.4; // 40% chance required
    needs[key] = { required: reqd };
    if (reqd) {
      if (key === 'food' || key === 'water') {
        needs[key].quantity = randomInt(1, 50);
      }
      if (key === 'rescue' || key === 'medical') {
        needs[key].urgency = pick(['low', 'medium', 'high', 'critical']);
      }
      needs[key].details = `Need ${key} assistance`;
    }
  }
  // ensure at least one required
  if (!Object.values(needs).some(n => n.required)) {
    const forced = pick(NEED_KEYS);
    needs[forced] = { required: true, details: `Need ${forced} assistance` };
  }
  return needs;
}

async function createRequests(victims, count = 30) {
  const requests = [];
  for (let i = 0; i < count; i++) {
    const submittedBy = pick(victims)._id;
    const [lon, lat] = jitterCoord(BASE, 20000);
    const priority = pick(PRIORITIES);
    const needs = randomNeeds();
    const req = await Request.create({
      submittedBy,
      location: { type: 'Point', coordinates: [lon, lat], address: 'Bangalore' },
      needs,
      beneficiaries: {
        adults: randomInt(1, 4),
        children: randomInt(0, 3),
        elderly: randomInt(0, 2),
        infants: randomInt(0, 1),
      },
      specialNeeds: {
        pregnant: Math.random() < 0.1,
        disabilities: Math.random() < 0.1 ? ['mobility'] : [],
      },
      selfDeclaredUrgency: pick(['low', 'medium', 'high', 'critical']),
      priority,
      status: 'new',
    });
    requests.push(req);
  }
  return requests;
}

async function autoAssignSome(requests, fraction = 0.6) {
  const toAssign = requests.slice(0, Math.floor(requests.length * fraction));
  const results = [];
  for (const r of toAssign) {
    try {
      const res = await autoMatchRequest(r._id);
      results.push(res);
    } catch (e) {
      console.error('autoMatchRequest error', e.message);
    }
  }
  return results;
}

async function createShelters(ngos, count = 3) {
  const shelters = [];
  for (let i = 0; i < count; i++) {
    const ngo = pick(ngos);
    const [lon, lat] = jitterCoord({ lon: ngo.location.coordinates[0], lat: ngo.location.coordinates[1] }, 10000);
    const total = randomInt(50, 500);
    const current = randomInt(0, total - 10);
    const shelter = await Shelter.create({
      name: `Shelter ${i + 1}`,
      managedBy: ngo._id,
      location: { type: 'Point', coordinates: [lon, lat], address: 'Bangalore' },
      type: pick(['school', 'community-hall', 'stadium', 'tent']),
      totalCapacity: total,
      currentOccupancy: current,
      availableCapacity: total - current,
      facilities: { water: true, electricity: true, toilets: randomInt(2, 20) },
      status: 'active',
    });
    shelters.push(shelter);
  }
  return shelters;
}

async function clusterSome(requests) {
  // Simple clustering: create 2 clusters grouping nearby requests
  if (requests.length < 6) return [];
  const clusters = [];
  const groupSize = Math.floor(requests.length / 3);
  for (let i = 0; i < 2; i++) {
    const subset = requests.slice(i * groupSize, i * groupSize + groupSize);
    const coords = subset.map((r) => r.location.coordinates);
    const centroid = [
      Number((coords.reduce((a, c) => a + c[0], 0) / coords.length).toFixed(6)),
      Number((coords.reduce((a, c) => a + c[1], 0) / coords.length).toFixed(6)),
    ];
    const lead = subset[0];
    const cluster = await RequestCluster.create({
      clusterName: `Cluster ${i + 1}`,
      leadRequest: lead._id,
      requests: subset.map((r) => r._id),
      location: { type: 'Point', coordinates: centroid, address: 'Cluster Area' },
      radius: randomInt(300, 1000),
      priority: pick(PRIORITIES),
      status: 'active',
    });
    clusters.push(cluster);
  }
  return clusters;
}

async function main() {
  const purge = hasFlag('purge');
  const ngosCount = Number(arg('ngos', 5));
  const victimsCount = Number(arg('victims', 12));
  const requestsCount = Number(arg('requests', 40));

  await connect();
  if (purge) await purgeAll();

  const core = await createCoreUsers();
  const ngos = await createNGOs(ngosCount);
  const victims = await createVictims(victimsCount);
  const offers = await createOffers(ngos);
  const requests = await createRequests(victims, requestsCount);
  await autoAssignSome(requests, 0.65);
  const shelters = await createShelters(ngos, 3);
  const clusters = await clusterSome(requests);

  // Basic audit log
  await AuditLog.log({ action: 'system_config', details: { seededAt: new Date(), ngos: ngos.length, victims: victims.length, offers: offers.length, requests: requests.length }, severity: 'low' });

  // Print summary counts
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

  await mongoose.disconnect();
  console.log('✅ Seed complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
