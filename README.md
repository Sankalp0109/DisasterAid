# 🚨 DisasterAid - Crisis Relief Coordination Platform

A comprehensive real-time platform connecting disaster victims with NGO responders through intelligent matching, automatic clustering, and multi-language SoS detection.

![Status](https://img.shields.io/badge/Status-100%25%20Complete-brightgreen)
![Backend](https://img.shields.io/badge/Backend-100%25-brightgreen)
![Frontend](https://img.shields.io/badge/Frontend-100%25-brightgreen)

---

## 📚 Table of Contents
1. [Project Overview](#-project-overview)
2. [Key Assumptions](#-key-assumptions)
3. [Architecture & Tech Stack](#-architecture--tech-stack)
4. [Quick Start (5 Minutes)](#-quick-start-5-minutes)
5. [Features & Workflows](#-features--workflows)
6. [Project Structure](#-project-structure)
7. [API Endpoints](#-api-endpoints)
8. [Configuration](#-configuration)
9. [Testing & Verification](#-testing--verification)
10. [Troubleshooting](#-troubleshooting)

---

## 🎯 Project Overview

**DisasterAid** is a crisis relief coordination platform designed for floods, earthquakes, cyclones, and other disasters. It enables:

- **Victims** to submit emergency requests with automatic SoS detection
- **NGOs** to publish offers and respond to requests
- **Authorities** to monitor crisis load and strategize assistance
- **Automated background assignment** using priority-based matching

### Key Features

✅ **Multi-role Authentication** (Victim, NGO, Authority, Admin)  
✅ **Automatic Request Clustering** (500m radius, 60% similarity)  
✅ **Intelligent NGO Matching** (Offers + Auto-match fallback with priority queue)  
✅ **Multi-language SoS Detection** (6 Indian languages)  
✅ **Real-time Communication** (Socket.IO with state sync)  
✅ **Priority Calculation** (5 levels: SOS, Critical, High, Medium, Low)  
✅ **Geospatial Queries** (Location-based matching)  
✅ **Audit Trail** (Complete activity logging)  
✅ **Evidence & Media Support** (Photos, videos, audio)  
✅ **Delivery Acknowledgment System** (Victim confirmation)  

---

## 🔍 Key Assumptions

### System Design Assumptions

#### 1. Database & Data Persistence
- **MongoDB** is the primary database
- Geospatial indexes (2dsphere) enabled on location fields
- Cascading deletes handled in application layer (not DB)
- Transactions not used (MongoDB standalone deployment support)
- Collections: Users, Requests, Assignments, NGOs, Offers, Clusters, AuditLogs, Advisories, Shelters

#### 2. Authentication & Authorization
- **JWT tokens** stored in browser localStorage
- **JWT secret** stored as environment variable (change in production)
- Role-based access control (RBAC) enforced at middleware level
- Password hashing with **bcryptjs** (10 salt rounds)
- Token expiry: 30 days (configured in backend)
- Logout clears localStorage and closes Socket.IO connection

#### 3. Real-time Communication (Socket.IO)
- WebSocket with fallback to polling
- Broadcasting to **role-based rooms**: `role:authority`, `role:ngo`, `role:victim`, `role:admin`, `role:operator`
- Request-specific rooms: `request:{id}`
- Assignment-specific rooms: `assignment:{id}`
- User-specific rooms: `user:{id}`
- Connection state managed in `SocketContext` on frontend
- Automatic reconnection with exponential backoff
- Grace period: 5 minutes before marking user offline

#### 4. Request Lifecycle & State Transitions
```
new → triaged → assigned → in-progress → fulfilled → closed
```
- Transitions **must** follow this order (enforced at controller level)
- Status changes broadcast via Socket.IO to all connected users
- Audit log created for each transition
- Request timeline tracks all status changes with performer details

#### 5. Priority System
- **Critical (SOS)** - Life-threatening, emergency response needed
- **High** - Urgent but not life-threatening
- **Medium** - Standard priority
- **Low** - Non-urgent requests
- Priority detected automatically via SoS detection
- Can be manually adjusted by operators/authorities
- Affects assignment queue order (higher priority processed first)

#### 6. SoS Detection (Multi-language)
- Detects keywords in: **English, Hindi, Tamil, Telugu, Kannada, Malayalam**
- Case-insensitive matching
- Keywords: help, rescue, danger, emergency, death, etc. + translations
- When SoS detected:
  - Request marked as `sosDetected: true`
  - Priority set to "critical"
  - Alert broadcast to all authorities
  - Added to SoS queue
- Triggers automated priority processing in assignment queue

#### 7. Automatic Request Clustering
- Requests within **500m radius** grouped together
- **60% similarity threshold** based on needs
- Clustering reduces duplicate processing
- Manual override possible by operators
- Cluster can have multiple requests from same/different victims
- Helps identify area-specific patterns

#### 8. NGO Auto-matching with Priority Queue
**Stage 1: Offer-based Matching (Preferred)**
- Check published NGO offers first (real inventory preferred)
- Score: capabilities (40%) + capacity (20%) + current load (20%) + rating (10%) + response time (10%)
- Reduced priority influence for offers (prefers actual stock)

**Stage 2: NGO Capacity-based Auto-match (Fallback)**
- If no suitable offer found
- Score similar factors with higher priority influence
- Check NGO online status, coverage radius, current load

**Stage 3: Manual Assignment (Last Resort)**
- If automated matching fails
- Operator manually assigns to available NGO

**Priority Queue Processing:**
- SOS/Critical requests processed first
- In-memory queue maintained in `autoAssignmentService.js`
- Configurable weights in `backend/config/matchingWeights.js`

#### 9. Operator Role & Automatic Assignment
- **Automatic assignment** enabled by default
- Operator dashboard available for:
  - Manual triage (if automatic fails)
  - Manual assignment adjustment
  - Crisis override
- Preference: **Let automation handle** (better throughput)
- Manual intervention: **Only when automated fails**

#### 10. Delivery & Fulfillment Workflow
1. **NGO uploads delivery proof**
   - Items fulfilled (what was delivered)
   - Photos, documents, notes
   - Status: `completed`

2. **Victim acknowledges delivery**
   - Reviews items received
   - Marks satisfied/unsatisfied
   - Provides rating & feedback
   - Status: `acknowledged`

3. **If items unsatisfied**
   - Reassignment automatically triggered
   - Request returns to `triaged` state
   - New matching attempt for missing items
   - Escalated to priority "high"

4. **If all items satisfied**
   - Request marked `fulfilled`
   - NGO marked for stats (completed assignments)
   - Timeline recorded

#### 11. Geospatial Queries & Location Handling
- Location stored as **GeoJSON Point**: `{type: "Point", coordinates: [lng, lat]}`
- MongoDB **2dsphere index** required on location field
- Distance calculations in **meters**
- Nearest NGO matching uses `$geoNear` aggregation
- Coordinates format: **[longitude, latitude]** (not lat/lng!)
- Default radius: 50km for initial search, refined to 500m for clustering

#### 12. Real-time Dashboard State Synchronization
- Authority dashboard listens for `stats:updated` event
- Event triggers `fetchStats()` and `fetchRequests()` calls
- Stats calculated server-side via MongoDB aggregation pipeline
- Crisis load distribution shows:
  - By Status: new, triaged, assigned, in-progress, fulfilled, closed
  - By Priority: critical, high, medium, low
- Updates on:
  - Request triaged
  - Assignment confirmed
  - Assignment status changed
  - Request fulfilled/closed
- Prevents stale dashboard states

#### 13. Evidence & Media Management
- **Supported formats**: JPG, PNG, MP4, MOV, MP3, WAV
- Stored as: **base64 or file paths** (depending on implementation)
- Multiple items per request/assignment supported
- Displayed in:
  - Request timeline
  - Assignment evidence gallery
  - Authority dashboard for review
- Handlers: `/api/requests/:id/evidence`, `/api/assignments/:id/evidence`

#### 14. Session & User Status Management
- **User marked online** on login + authentication
- Socket.IO connection tracked per user
- **User marked offline** after:
  - Explicit logout
  - 5 minutes inactivity
  - Socket connection closed
- NGO status synced with user status (online/offline)
- Status used for availability calculations

#### 15. Audit Logging & Compliance
- **Every action** logged with: timestamp, user, role, action type, changes made
- Used for compliance, debugging, audit trails
- Queryable by: action type, user ID, time range, target type
- Actions logged:
  - Authentication (login, logout, register)
  - Request operations (create, update, triage, close)
  - Assignment operations (create, confirm, status change, deliver)
  - NGO operations (create offer, update, delete)
  - Admin operations (user management, system settings)
- Retention: Indefinite (can be archived in production)

#### 16. Error Handling & Validation
- **Frontend**: Client-side validation on all forms
- **Backend**: Server-side validation on all inputs
- **CORS**: Configured for FRONTEND_URLS (environment variable)
- **Rate limiting**: Recommended for production
- **Error responses**: Consistent JSON format with status codes
- **404**: Resource not found
- **403**: Access denied (RBAC violation)
- **400**: Bad request (validation error)
- **500**: Server error (logged for debugging)

---

## 🏗️ Architecture & Tech Stack

### Backend Architecture

```
Node.js + Express
    ↓
JWT Authentication + Role-based middleware
    ↓
Request Handlers (Controllers)
    ↓
Business Logic (Services)
    ↓
MongoDB (Mongoose ODM)
    ↓
Socket.IO (Real-time broadcasting)
```

### Technology Stack

**Backend:**
- **Node.js** 16+ with Express.js
- **MongoDB** 4.0+ with Mongoose ODM
- **Socket.IO** 4.0+ (real-time communication)
- **JWT** (JSON Web Tokens for auth)
- **bcryptjs** (password hashing)
- **axios** (HTTP client)
- **json2csv** (export functionality)

**Frontend:**
- **React 19** with React Router v6
- **Tailwind CSS** (styling)
- **Axios** (API calls)
- **Socket.IO Client** (real-time)
- **Lucide React** (icons)
- **React Leaflet** (mapping)
- **Vite** (build tool)

### System Flow

```
1. Victim submits request (4-step form)
   ↓
2. Backend validates + calculates SoS detection + priority
   ↓
3. Request saved to MongoDB
   ↓
4. Automatic clustering triggers (if similar requests nearby)
   ↓
5. Auto-matching enqueued:
   a. High/SOS processed first (priority queue)
   b. Check offers first (scored with distance, availability, rating)
   c. Fall back to NGO auto-match if needed
   ↓
6. Assignment created (ticket issued)
   ↓
7. Socket.IO broadcast to NGO (notification)
   ↓
8. NGO receives notification + accepts/declines
   ↓
9. Real-time tracking + chat between NGO & victim
   ↓
10. NGO uploads delivery proof
    ↓
11. Victim acknowledges + confirms receipt
    ↓
12. Request marked fulfilled/closed
    ↓
13. Audit log recorded
```

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites
- Node.js 16+ installed
- MongoDB 4.0+ installed locally OR Atlas connection string
- npm or yarn
- Terminal/Command Prompt

### Step 1: Start MongoDB

```bash
# If MongoDB installed locally
mongod

# OR use MongoDB Atlas - get connection string and add to .env
```

### Step 2: Start Backend

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
PORT=3000
MONGODB_URI=mongodb://localhost:27017/disasteraid
JWT_SECRET=your-super-secret-key-change-in-production
NODE_ENV=development
FRONTEND_URLS=http://localhost:5173,http://127.0.0.1:5173
EOF

# Start backend
npm run dev
```

**Backend runs on: http://localhost:3000** ✅

### Step 3: Start Frontend

Open new terminal:

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start frontend
npm run dev
```

**Frontend runs on: http://localhost:5173** ✅

### Step 4: Test the Application

#### Option A: Web Interface
1. Open http://localhost:5173
2. Click "Register"
3. Create account (role: Victim)
4. Login
5. Click "Submit New Request"
6. Fill 4-step form
7. Submit → see request in dashboard ✅

#### Option B: API Testing

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Victim",
    "email": "victim@test.com",
    "password": "123456",
    "role": "victim"
  }'

# Login (copy token from response)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "victim@test.com",
    "password": "123456"
  }'

# Create Request (use token from login)
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "contact": {"phone": "+91-9876543210"},
    "location": {
      "type": "Point",
      "coordinates": [77.5946, 12.9716],
      "address": "Koramangala, Bangalore"
    },
    "needs": {
      "rescue": {"required": true, "urgency": "critical"}
    },
    "beneficiaries": {
      "adults": 3,
      "children": 2
    },
    "description": "Urgent help needed - water rising fast!",
    "selfDeclaredUrgency": "high"
  }'
```

### Step 5: Create Different User Types

```bash
# NGO User
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Relief NGO",
    "email": "ngo@test.com",
    "password": "123456",
    "role": "ngo"
  }'

# Authority User
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Authority Officer",
    "email": "authority@test.com",
    "password": "123456",
    "role": "authority"
  }'

# Admin User
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin User",
    "email": "admin@test.com",
    "password": "123456",
    "role": "admin"
  }'
```

---

## 🎯 Features & Workflows

### Victim Workflow
1. Register/Login
2. Submit request with:
   - Location (automatic GPS)
   - Needs (rescue, food, water, medical, shelter)
   - Beneficiaries (adults, children, elderly)
   - Urgency level
3. SoS detected automatically if keywords present
4. Auto-assigned to NGO
5. Track status in real-time
6. Chat with assigned NGO
7. Confirm delivery when NGO arrives
8. Rate experience
9. Request closed

### NGO Workflow
1. Register/Login
2. Publish offers (or rely on auto-matching)
3. Receive assignment notifications
4. Accept/decline assignment
5. Update status as work progresses
6. Chat with victim
7. Upload delivery proof
8. Get victim confirmation
9. Complete assignment

### Authority Workflow
1. Login
2. View crisis load distribution dashboard
3. See SoS alerts
4. Monitor real-time stats
5. Export data for reporting
6. Manually triage if needed
7. Override auto-matching if critical
8. View analytics and heatmaps

### Admin Workflow
1. Login to admin panel
2. Manage users (create, edit, disable)
3. Verify NGOs
4. Override system settings
5. View audit logs
6. Export complete system data

---

## 🛠️ Frontend Setup Details

### Frontend Technology
- **React 19** with React Router v6
- **Vite** build tool for fast development
- **Tailwind CSS** for styling
- **Socket.IO Client** for real-time communication
- **Leaflet/React-Leaflet** for mapping
- **Lucide React** for icons
- **Axios** for HTTP requests

### Frontend Build Configuration
Located in `frontend/vite.config.js`:
- Babel support via @vitejs/plugin-react
- ESLint rules configured
- HMR (Hot Module Replacement) enabled

### Running Frontend
```bash
cd frontend
npm install
npm run dev    # Start development server (port 5173)
npm run build  # Build for production
npm run lint   # Run ESLint
```

### Frontend Environment
**Optional `frontend/.env.local`:**
```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

---

## 🛠️ Backend Setup Details

### Backend Technology
- **Node.js + Express.js** for server
- **MongoDB + Mongoose** for data persistence
- **Socket.IO** for real-time communication
- **JWT** for authentication
- **bcryptjs** for password hashing
- **json2csv** for data export

### Backend Entry Point
`backend/index.js` - Starts Express server and Socket.IO

### Backend Structure
```
backend/
├── models/          # MongoDB schemas
├── controllers/     # Request handlers
├── routes/          # API endpoint definitions
├── services/        # Business logic (matching, clustering, SoS)
├── middleware/      # Auth, validation, RBAC
├── socket/          # Real-time event handlers
├── config/          # Configuration files
├── scripts/         # Database utilities
└── index.js         # Server entry point
```

### Running Backend
```bash
cd backend
npm install
npm run dev      # Start with nodemon (auto-restart on file changes)
npm start        # Start in production
```

### Key Backend Services
- **sosDetection.js** - Multi-language SoS keyword detection
- **clusteringService.js** - Request clustering (500m radius)
- **matchingService.js** - NGO matching logic
- **autoAssignmentService.js** - Priority queue assignment system
- **analyticsController.js** - Dashboard statistics calculation

---

## 🗂️ Project Structure

```
DisasterAid/
├── backend/
│   ├── models/
│   │   ├── User.js              # Multi-role authentication
│   │   ├── Request.js           # Emergency requests
│   │   ├── Assignment.js        # Task assignments
│   │   ├── NGO.js               # Organization profiles
│   │   ├── Offer.js             # Resource offers
│   │   ├── RequestCluster.js    # Clustering
│   │   ├── AuditLog.js          # Activity logging
│   │   └── Advisory.js          # Public advisories
│   │
│   ├── controllers/
│   │   ├── authController.js    # Auth endpoints
│   │   ├── requestController.js # Request CRUD
│   │   ├── assignmentController.js
│   │   ├── ngoController.js
│   │   ├── offerController.js
│   │   └── analyticsController.js
│   │
│   ├── services/
│   │   ├── sosDetection.js      # SoS keyword detection
│   │   ├── clusteringService.js # Request clustering
│   │   ├── matchingService.js   # NGO matching logic
│   │   └── autoAssignmentService.js # Priority queue
│   │
│   ├── routes/
│   │   ├── auth.js
│   │   ├── requests.js
│   │   ├── assignments.js
│   │   └── ...other routes
│   │
│   ├── middleware/
│   │   ├── auth.js              # JWT verification
│   │   └── rbac.js              # Role-based access
│   │
│   ├── socket/
│   │   ├── socketHandlers.js    # Real-time events
│   │   └── ioInstance.js        # Socket.IO setup
│   │
│   ├── config/
│   │   ├── matchingWeights.js   # Tunable scoring
│   │   └── database.js          # DB connection
│   │
│   └── index.js                 # Server entry point
│
└── frontend/
    ├── src/
    │   ├── context/
    │   │   ├── AuthContext.jsx   # Auth state
    │   │   └── SocketContext.jsx # Socket state
    │   │
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Register.jsx
    │   │   ├── Home.jsx
    │   │   ├── victim/
    │   │   │   ├── Dashboard.jsx
    │   │   │   └── RequestForm.jsx
    │   │   ├── ngo/
    │   │   ├── authority/
    │   │   │   └── AuthorityDashboard.jsx
    │   │   ├── admin/
    │   │   └── operator/
    │   │
    │   ├── components/
    │   │   ├── AdvisoriesBanner.jsx
    │   │   ├── RequestTracking.jsx
    │   │   └── ...other components
    │   │
    │   └── App.jsx               # Main router
    │
    └── vite.config.js
```

---

## 🔌 API Endpoints

### Authentication (`/api/auth`)
```
POST   /auth/register          Register new user
POST   /auth/login             User login
POST   /auth/logout            User logout
GET    /auth/me                Get current user
PUT    /auth/profile           Update profile
```

### Requests (`/api/requests`)
```
POST   /requests               Create request
GET    /requests               List requests (filtered)
GET    /requests/:id           Get request details
PUT    /requests/:id           Update request
POST   /requests/:id/triage    Triage request
POST   /requests/:id/close     Close request
POST   /requests/:id/messages  Send message
POST   /requests/:id/evidence  Upload evidence
GET    /requests/sos           Get SoS queue
```

### Assignments (`/api/assignments`)
```
POST   /assignments            Create assignment
GET    /assignments            List assignments
GET    /assignments/:id        Get assignment
PATCH  /assignments/:id/status Update status
POST   /assignments/:id/confirm Confirm (NGO)
POST   /assignments/:id/decline Decline (NGO)
POST   /assignments/:id/delivery-proof Upload proof
POST   /assignments/:id/acknowledge Victim confirm
```

### NGOs (`/api/ngos`)
```
POST   /ngos                   Create NGO
GET    /ngos                   List NGOs
GET    /ngos/:id               Get NGO details
PUT    /ngos/:id               Update NGO
```

### Offers (`/api/offers`)
```
POST   /offers                 Create offer (NGO)
GET    /offers                 List offers
GET    /offers/:id             Get offer
PUT    /offers/:id             Update offer
DELETE /offers/:id             Delete offer
PATCH  /offers/:id/toggle      Pause/resume
```

### Analytics (`/api/analytics`)
```
GET    /analytics/stats        Get dashboard stats
GET    /analytics/export/:type Export data (CSV/JSON)
```

---

## 🔧 Configuration

### Backend Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/disasteraid

# Authentication
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRE=30d

# Frontend URLs (for CORS & Socket.IO)
FRONTEND_URLS=http://localhost:5173,http://127.0.0.1:5173

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# SMS (optional)
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_FROM=+1234567890
```

### Frontend Configuration (optional .env.local)

```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

### Tunable System Parameters

**In `backend/config/matchingWeights.js`:**
```javascript
MATCHING_WEIGHTS = {
  capability: 40,      // Importance of matching needs
  capacity: 20,        // NGO's remaining capacity
  load: 20,            // Current workload factor
  rating: 10,          // Historical rating
  responseTime: 10,    // Past response speed
  priorityBoost: 25    // SOS/Critical multiplier
}
```

**In `backend/services/clusteringService.js`:**
```javascript
CLUSTER_RADIUS = 500;        // meters
SIMILARITY_THRESHOLD = 0.6;  // 60%
```

---

## 🧪 Testing & Verification

### Health Checks

```bash
# Backend health
curl http://localhost:3000/api/health

# Socket.IO connection
# Open browser console at http://localhost:5173
# Check for: "✅ Socket connected: [socket-id]"
```

### Verify SoS Detection

```bash
curl -X POST http://localhost:3000/api/requests \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contact": {"phone": "+91-9876543210"},
    "location": {
      "type": "Point",
      "coordinates": [77.5946, 12.9716],
      "address": "Bangalore"
    },
    "needs": {"rescue": {"required": true}},
    "beneficiaries": {"adults": 2},
    "description": "HELP! मदद! बचाओ! Emergency!",
    "selfDeclaredUrgency": "critical"
  }'

# Check response: sosDetected should be true
```

### Verify Real-time Updates

1. Open two browser windows
2. Login as different users
3. Create request in window 1
4. Watch it appear in window 2 in real-time ✅

### Check Database

```bash
# Connect to MongoDB
mongosh disasteraid

# View collections
show collections

# View users
db.users.find().limit(5).pretty()

# View requests
db.requests.find().limit(5).pretty()

# View assignments
db.assignments.find().limit(5).pretty()

# Check geospatial index
db.requests.getIndexes()
```

---

## 🐛 Troubleshooting

### Backend Won't Start
**Problem**: `EADDRINUSE` or MongoDB connection error
```bash
# Check if port 3000 is in use
netstat -an | grep 3000  # Linux/Mac
netstat -ano | findstr 3000  # Windows

# Check MongoDB is running
mongosh --eval "db.version()"

# Verify .env file
cat backend/.env
```

### Frontend Won't Start
**Problem**: Port 5173 already in use or build error
```bash
# Clear node_modules and reinstall
rm -rf frontend/node_modules
npm install

# Start frontend explicitly
npm run dev -- --host 127.0.0.1 --port 5173
```

### Can't Login
**Problem**: Invalid credentials or token issues
```bash
# Check user exists in database
mongosh disasteraid
db.users.findOne({email: "test@example.com"})

# Clear browser localStorage
# Open DevTools → Application → Storage → Clear site data
```

### Socket Not Connecting
**Problem**: Real-time updates not working
```bash
# Check backend is running
curl http://localhost:3000/api/health

# Check browser console for Socket.IO errors
# Verify FRONTEND_URLS includes your frontend URL

# Test socket connection
curl -v http://localhost:3000/socket.io/?EIO=4&transport=websocket
```

### Crisis Load Distribution Not Updating
**Problem**: Dashboard stats are stale
**Solution**:
1. Backend emits `stats:updated` event when:
   - Request triaged
   - Assignment confirmed
   - Assignment status changed
2. Frontend listener calls `fetchStats()` + `fetchRequests()`
3. Dashboard re-renders with fresh data

Try:
- Manual refresh button on dashboard
- Check browser console for errors
- Verify Socket.IO connection active
- Clear localStorage cache

### Assignment Not Auto-Matching
**Problem**: Requests stuck in "triaged" state
**Solution**:
1. Check if auto-matching service is running
2. Verify NGOs have published offers OR capacity available
3. Check matching logs in backend console
4. Manually assign via operator dashboard

---

## 📚 Additional Resources

### Documentation Files
- **Main Setup**: This README
- **Project Status**: PROJECT_COMPLETION_SUMMARY.md
- **API Details**: Search for API documentation in codebase

### Code Examples

**Submitting a Request (Frontend):**
```javascript
const response = await axios.post('/api/requests', {
  contact: { phone: "+91-9876543210" },
  location: { type: "Point", coordinates: [lng, lat], address: "..." },
  needs: { rescue: { required: true, urgency: "critical" } },
  beneficiaries: { adults: 2, children: 1 },
  selfDeclaredUrgency: "high"
}, {
  headers: { Authorization: `Bearer ${token}` }
});
```

**Creating an Assignment (Backend):**
```javascript
const assignment = new Assignment({
  request: requestId,
  assignedTo: ngoId,
  category: "rescue",
  priority: request.priority,
  deliveryLocation: { type: "Point", coordinates: request.location.coordinates }
});
await assignment.save();
io.emit('stats:updated', { timestamp: new Date(), eventType: 'assignment_created' });
```

---

## 🎉 System Complete!

All features implemented and tested. The DisasterAid platform is **production-ready**.

**Status Summary:**
- ✅ Backend: 100% Complete
- ✅ Frontend: 100% Complete  
- ✅ Real-time Communication: 100% Complete
- ✅ Auto-matching: 100% Complete
- ✅ SoS Detection: 100% Complete
- ✅ Crisis Load Dashboard: 100% Complete
- ✅ Audit Trail: 100% Complete

**Version**: 1.0.0  
**Last Updated**: December 2024  
**Maintainer**: Disaster Relief Team  

---

**Ready to deploy? Check your environment variables and run production builds!** 🚀
