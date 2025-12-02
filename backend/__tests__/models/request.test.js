import { Request } from '../../models/Request.js';
import { User } from '../../models/User.js';

describe('Request Model Tests', () => {
  let testUser;

  beforeEach(async () => {
    testUser = await User.create({
      name: 'Test Victim',
      email: 'victim@example.com',
      password: 'password123',
      role: 'victim',
      phoneNumber: '+1234567890'
    });
  });

  describe('Request Creation', () => {
    test('should create a request with valid data', async () => {
      const requestData = {
        title: 'Emergency Food Supply',
        description: 'Need food for 5 people',
        priority: 'high',
        category: 'food',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Bangalore, India'
        },
        needs: {
          food: { required: true, quantity: 10, unit: 'kg' },
          water: { required: true, quantity: 20, unit: 'liters' }
        }
      };

      const request = await Request.create(requestData);

      expect(request.title).toBe(requestData.title);
      expect(request.priority).toBe(requestData.priority);
      expect(request.category).toBe(requestData.category);
      expect(request.status).toBe('pending');
      expect(request.ticketNumber).toBeDefined();
      expect(request.ticketNumber).toMatch(/^REQ-\d{10}$/);
    });

    test('should auto-generate ticket number', async () => {
      const request1 = await Request.create({
        title: 'Request 1',
        priority: 'medium',
        category: 'medical',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Location 1'
        }
      });

      const request2 = await Request.create({
        title: 'Request 2',
        priority: 'low',
        category: 'shelter',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Location 2'
        }
      });

      expect(request1.ticketNumber).toBeDefined();
      expect(request2.ticketNumber).toBeDefined();
      expect(request1.ticketNumber).not.toBe(request2.ticketNumber);
    });

    test('should fail without required fields', async () => {
      const invalidRequest = {
        title: 'Test Request'
        // Missing priority, category, createdBy, location
      };

      await expect(Request.create(invalidRequest)).rejects.toThrow();
    });

    test('should validate priority enum', async () => {
      const invalidRequest = {
        title: 'Test Request',
        priority: 'super_urgent',
        category: 'food',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Test Location'
        }
      };

      await expect(Request.create(invalidRequest)).rejects.toThrow();
    });

    test('should validate category enum', async () => {
      const invalidRequest = {
        title: 'Test Request',
        priority: 'high',
        category: 'invalid_category',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Test Location'
        }
      };

      await expect(Request.create(invalidRequest)).rejects.toThrow();
    });

    test('should validate status enum', async () => {
      const invalidRequest = {
        title: 'Test Request',
        priority: 'high',
        category: 'food',
        createdBy: testUser._id,
        status: 'invalid_status',
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Test Location'
        }
      };

      await expect(Request.create(invalidRequest)).rejects.toThrow();
    });

    test('should handle all valid priorities', async () => {
      const priorities = ['sos', 'critical', 'high', 'medium', 'low'];

      for (let i = 0; i < priorities.length; i++) {
        const request = await Request.create({
          title: `Request ${i}`,
          priority: priorities[i],
          category: 'food',
          createdBy: testUser._id,
          location: {
            type: 'Point',
            coordinates: [77.5946, 12.9716],
            address: 'Test Location'
          }
        });

        expect(request.priority).toBe(priorities[i]);
      }
    });

    test('should handle all valid categories', async () => {
      const categories = ['food', 'water', 'shelter', 'medical', 'rescue', 'evacuation', 'other'];

      for (let i = 0; i < categories.length; i++) {
        const request = await Request.create({
          title: `Request ${i}`,
          priority: 'medium',
          category: categories[i],
          createdBy: testUser._id,
          location: {
            type: 'Point',
            coordinates: [77.5946, 12.9716],
            address: 'Test Location'
          }
        });

        expect(request.category).toBe(categories[i]);
      }
    });

    test('should handle all valid statuses', async () => {
      const statuses = ['pending', 'triaged', 'assigned', 'in_progress', 'fulfilled', 'cancelled'];

      for (let i = 0; i < statuses.length; i++) {
        const request = await Request.create({
          title: `Request ${i}`,
          priority: 'medium',
          category: 'food',
          createdBy: testUser._id,
          status: statuses[i],
          location: {
            type: 'Point',
            coordinates: [77.5946, 12.9716],
            address: 'Test Location'
          }
        });

        expect(request.status).toBe(statuses[i]);
      }
    });
  });

  describe('Request Location Tests', () => {
    test('should store GeoJSON location correctly', async () => {
      const request = await Request.create({
        title: 'Test Request',
        priority: 'medium',
        category: 'food',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Bangalore, India',
          city: 'Bangalore',
          state: 'Karnataka',
          country: 'India'
        }
      });

      expect(request.location.type).toBe('Point');
      expect(request.location.coordinates).toEqual([77.5946, 12.9716]);
      expect(request.location.address).toBe('Bangalore, India');
      expect(request.location.city).toBe('Bangalore');
    });

    test('should handle different coordinate formats', async () => {
      const coordinates = [
        [-122.4194, 37.7749],  // San Francisco
        [0, 0],                 // Null Island
        [180, 90],              // Max valid coordinates
        [-180, -90]             // Min valid coordinates
      ];

      for (let i = 0; i < coordinates.length; i++) {
        const request = await Request.create({
          title: `Request ${i}`,
          priority: 'medium',
          category: 'food',
          createdBy: testUser._id,
          location: {
            type: 'Point',
            coordinates: coordinates[i],
            address: 'Test Location'
          }
        });

        expect(request.location.coordinates).toEqual(coordinates[i]);
      }
    });
  });

  describe('Request Needs Tests', () => {
    test('should handle complex needs structure', async () => {
      const request = await Request.create({
        title: 'Complex Request',
        priority: 'high',
        category: 'food',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Test Location'
        },
        needs: {
          food: { required: true, quantity: 10, unit: 'kg', description: 'Rice and dal' },
          water: { required: true, quantity: 20, unit: 'liters', description: 'Drinking water' },
          medical: { required: false, quantity: 5, unit: 'units', description: 'First aid kits' },
          shelter: { required: true, quantity: 1, unit: 'tent', description: 'Family tent' }
        }
      });

      expect(request.needs.food.required).toBe(true);
      expect(request.needs.food.quantity).toBe(10);
      expect(request.needs.water.unit).toBe('liters');
      expect(request.needs.medical.description).toBe('First aid kits');
    });

    test('should handle empty needs object', async () => {
      const request = await Request.create({
        title: 'Test Request',
        priority: 'medium',
        category: 'other',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Test Location'
        },
        needs: {}
      });

      expect(request.needs).toEqual({});
    });
  });

  describe('Request Status Workflow', () => {
    test('should track status changes', async () => {
      const request = await Request.create({
        title: 'Workflow Test',
        priority: 'high',
        category: 'medical',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Test Location'
        }
      });

      expect(request.status).toBe('pending');

      // Triage
      request.status = 'triaged';
      await request.save();
      expect(request.status).toBe('triaged');

      // Assign
      request.status = 'assigned';
      await request.save();
      expect(request.status).toBe('assigned');

      // In Progress
      request.status = 'in_progress';
      await request.save();
      expect(request.status).toBe('in_progress');

      // Fulfill
      request.status = 'fulfilled';
      request.fulfilledAt = new Date();
      await request.save();
      expect(request.status).toBe('fulfilled');
      expect(request.fulfilledAt).toBeDefined();
    });
  });

  describe('Request Edge Cases', () => {
    test('should handle very long descriptions', async () => {
      const longDesc = 'A'.repeat(5000);
      const request = await Request.create({
        title: 'Long Description Test',
        description: longDesc,
        priority: 'medium',
        category: 'other',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Test Location'
        }
      });

      expect(request.description).toBe(longDesc);
    });

    test('should handle special characters in title', async () => {
      const request = await Request.create({
        title: 'Emergency! @#$%^&*() Need Help 🆘',
        priority: 'sos',
        category: 'rescue',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Test Location'
        }
      });

      expect(request.title).toBe('Emergency! @#$%^&*() Need Help 🆘');
    });

    test('should handle large quantities in needs', async () => {
      const request = await Request.create({
        title: 'Large Quantity Request',
        priority: 'high',
        category: 'food',
        createdBy: testUser._id,
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
          address: 'Test Location'
        },
        needs: {
          food: { required: true, quantity: 999999, unit: 'kg' }
        }
      });

      expect(request.needs.food.quantity).toBe(999999);
    });
  });

  describe('Request Query Tests', () => {
    beforeEach(async () => {
      await Request.create([
        {
          title: 'Request 1',
          priority: 'sos',
          category: 'rescue',
          status: 'pending',
          createdBy: testUser._id,
          location: { type: 'Point', coordinates: [77.5, 12.9], address: 'Loc 1' }
        },
        {
          title: 'Request 2',
          priority: 'high',
          category: 'medical',
          status: 'triaged',
          createdBy: testUser._id,
          location: { type: 'Point', coordinates: [77.6, 13.0], address: 'Loc 2' }
        },
        {
          title: 'Request 3',
          priority: 'medium',
          category: 'food',
          status: 'assigned',
          createdBy: testUser._id,
          location: { type: 'Point', coordinates: [77.7, 13.1], address: 'Loc 3' }
        },
        {
          title: 'Request 4',
          priority: 'low',
          category: 'shelter',
          status: 'fulfilled',
          createdBy: testUser._id,
          location: { type: 'Point', coordinates: [77.8, 13.2], address: 'Loc 4' }
        }
      ]);
    });

    test('should find requests by priority', async () => {
      const sosRequests = await Request.find({ priority: 'sos' });
      expect(sosRequests).toHaveLength(1);
      expect(sosRequests[0].priority).toBe('sos');
    });

    test('should find requests by status', async () => {
      const pending = await Request.find({ status: 'pending' });
      expect(pending).toHaveLength(1);
    });

    test('should find requests by category', async () => {
      const medical = await Request.find({ category: 'medical' });
      expect(medical).toHaveLength(1);
    });

    test('should find requests by user', async () => {
      const userRequests = await Request.find({ createdBy: testUser._id });
      expect(userRequests).toHaveLength(4);
    });

    test('should sort requests by priority', async () => {
      const requests = await Request.find().sort({ priority: 1 });
      expect(requests[0].priority).toBe('sos');
    });
  });
});
