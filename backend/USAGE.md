# DisasterAid - Usage Guide

## System Flow

1. **Victim** submits request with all info (location, needs, etc.)
2. **System** automatically matches to best NGO based on location, capabilities, capacity
3. **NGO** receives notification and starts WhatsApp-like chat with victim
4. **Both** can send messages in real-time

---

## Socket Events

### VICTIM SIDE

#### 1. Initialize Session
```javascript
socket.emit('victim:init', { language: 'en' }, (response) => {
  // response.sessionId
});
```

#### 2. Submit Complete Request
```javascript
socket.emit('victim:submit-request', {
  contact: {
    phone: '+91-9876543210',
    email: 'victim@example.com'
  },
  location: {
    coordinates: [77.5946, 12.9716], // [lng, lat]
    address: 'Koramangala, Bangalore',
    landmark: 'Near City Hospital'
  },
  needs: {
    rescue: { required: true, urgency: 'critical', details: '...' },
    food: { required: true, quantity: 10 },
    water: { required: true, quantity: 20 },
    medical: { required: true, urgency: 'high', details: '...' }
  },
  beneficiaries: {
    adults: 3,
    children: 2,
    elderly: 1,
    infants: 0
  },
  specialNeeds: {
    medicalConditions: ['diabetes'],
    pregnant: false,
    pets: { has: true, count: 1, type: ['dog'] }
  },
  urgency: 'high', // low, medium, high, critical
  deviceInfo: {
    batteryLevel: 25,
    signalStrength: 'fair'
  }
}, (response) => {
  // response.requestId
  // response.assignedNGO { id, name, isOnline }
});
```

#### 3. Send Message (WhatsApp-like)
```javascript
socket.emit('victim:send-message', {
  requestId: 'xxx',
  message: 'Hello, we need help urgently',
  type: 'text' // or 'image', 'location', etc.
}, (response) => {
  // response.messageId
});
```

#### 4. Typing Indicator
```javascript
socket.emit('victim:typing', {
  requestId: 'xxx',
  isTyping: true
});
```

#### 5. Receive Messages
```javascript
socket.on('message:received', (data) => {
  // data.requestId
  // data.message { sender: 'ngo', message: '...', timestamp, type }
});
```

#### 6. Receive Typing Indicator
```javascript
socket.on('typing:indicator', (data) => {
  // data.sender: 'ngo'
  // data.isTyping: true/false
});
```

---

### NGO SIDE

#### 1. Connect NGO
```javascript
socket.emit('ngo:connect', {
  ngoId: 'ngo-id-from-database'
}, (response) => {
  // response.ngo { id, name, activeRequests }
  // response.pendingRequests [ {...}, {...} ]
});
```

#### 2. Receive New Request
```javascript
socket.on('ngo:new-request', (data) => {
  // data.requestId
  // data.victim { location, needs, beneficiaries, priority, contact }
});
```

#### 3. Send Message
```javascript
socket.emit('ngo:send-message', {
  requestId: 'xxx',
  message: 'Help is on the way!',
  type: 'text'
}, (response) => {
  // response.messageId
});
```

#### 4. Typing Indicator
```javascript
socket.emit('ngo:typing', {
  requestId: 'xxx',
  isTyping: true
});
```

#### 5. Update Request Status
```javascript
socket.emit('ngo:update-status', {
  requestId: 'xxx',
  status: 'in-progress' // or 'resolved'
}, (response) => {
  // response.success
});
```

#### 6. Get Chat History
```javascript
socket.emit('get-chat-history', {
  requestId: 'xxx'
}, (response) => {
  // response.messages [ {...}, {...} ]
  // response.requestInfo { status, priority, assignedNGO }
});
```

---

## NGO Matching Algorithm

**Scoring (100 points max):**
- Capability Match: 40 points
- Current Capacity: 20 points
- Load (active requests): 20 points
- Rating: 10 points
- Response Time: 10 points
- Bonus for critical/SOS: +15 points

**Criteria:**
- Location: Within 100km radius
- Online NGOs prioritized
- Must have required capabilities
- Considers current load

---

## Priority Levels

- **SOS** (score ≥15): Life-threatening
- **Critical** (score ≥10): Urgent
- **High** (score ≥6): Important
- **Medium** (score ≥3): Standard
- **Low** (score <3): Non-urgent

---

## Database Models

### NGO
- name, email, phone
- location (coordinates, address, city, state)
- coverageRadius (default 50km)
- capabilities (rescue, food, water, medical, etc.)
- currentCapacity, activeRequests, maxActiveRequests
- isActive, isOnline, socketId
- stats (totalRequestsHandled, rating, etc.)

### VictimRequest
- sessionId, socketId, language
- contact, location, needs, beneficiaries, specialNeeds
- priority, status, assignedTo (NGO)
- messages (WhatsApp-like chat history)
- deviceInfo, evidence
- timestamps

---

## Example Usage

### Victim Flow
```javascript
const socket = io('http://localhost:3000');

// 1. Init
socket.emit('victim:init', { language: 'en' });

// 2. Submit request
socket.emit('victim:submit-request', {
  contact: { phone: '+91-9876543210' },
  location: { coordinates: [77.5946, 12.9716] },
  needs: { rescue: { required: true } },
  urgency: 'critical'
}, (res) => {
  const requestId = res.requestId;
  
  // 3. Chat
  socket.emit('victim:send-message', {
    requestId,
    message: 'We are trapped on 3rd floor'
  });
});

// Listen for NGO responses
socket.on('message:received', (data) => {
  console.log('NGO:', data.message.message);
});
```

### NGO Flow
```javascript
const socket = io('http://localhost:3000');

// 1. Connect
socket.emit('ngo:connect', { ngoId: 'xxx' }, (res) => {
  console.log('Active requests:', res.pendingRequests);
});

// 2. Listen for new requests
socket.on('ngo:new-request', (data) => {
  console.log('New request:', data.requestId);
  
  // 3. Respond
  socket.emit('ngo:send-message', {
    requestId: data.requestId,
    message: 'Help is on the way!'
  });
});

// Listen for victim messages
socket.on('message:received', (data) => {
  console.log('Victim:', data.message.message);
});
```
