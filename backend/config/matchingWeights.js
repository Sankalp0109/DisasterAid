// Centralized weight configuration for NGO/Offer matching
// Adjust these values to tune the assignment behavior without changing code.
export const MATCHING_WEIGHTS = {
  capability: 40,
  capacity: 20,
  load: 20,
  rating: 10,
  response: 10,
  // Priority boost applied after base scoring
  priorityBoost: {
    sos: 25,
    critical: 15,
    high: 8,
    medium: 0,
    low: 0,
  },
  rescueBoost: 10, // Extra if rescue capability for critical/sos
  onlineBoost: 5,  // Prefer currently online NGOs
  twentyFourSeven: 5, // Bonus for 24x7 availability
};

// Convert priority string to ordering weight for queues (higher = earlier service)
export function priorityOrderValue(priority) {
  switch (priority) {
    case "sos": return 100;
    case "critical": return 80;
    case "high": return 50;
    case "medium": return 20;
    case "low": return 10;
    default: return 15;
  }
}
