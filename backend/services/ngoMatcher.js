import { NGO } from "../models/NGO.js";
import { BlockedRoute } from "../models/BlockedRoute.js";

/**
 * Find best matching NGO for a victim request
 * Scoring based on: location proximity, capabilities match, capacity, response time, route availability
 */
export async function findBestNGO(victimRequest) {
  try {
    // Get victim location
    const victimCoords = victimRequest.location?.coordinates;
    if (!victimCoords || victimCoords.length !== 2) {
      throw new Error("Valid location coordinates required for matching");
    }

    const [longitude, latitude] = victimCoords;

    // Get required capabilities from victim needs
    const requiredCapabilities = [];
    if (victimRequest.needs) {
      Object.keys(victimRequest.needs).forEach((need) => {
        if (victimRequest.needs[need]?.required) {
          requiredCapabilities.push(need);
        }
      });
    }

    // Find NGOs near the location with required capabilities
    const ngos = await NGO.find({
      isActive: true,
      isOnline: true,
      "location.coordinates": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          $maxDistance: 100000, // 100km max
        },
      },
    });

    if (ngos.length === 0) {
      // No online NGOs found, try offline but active ones
      const offlineNGOs = await NGO.find({
        isActive: true,
        "location.coordinates": {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [longitude, latitude],
            },
            $maxDistance: 100000,
          },
        },
      }).limit(10);

      if (offlineNGOs.length === 0) {
        return null;
      }

      // Return best offline NGO
      return await calculateBestMatch(offlineNGOs, victimRequest, requiredCapabilities);
    }

    // Fetch active blocked routes
    const blockedRoutes = await BlockedRoute.findActive();
    
    // Calculate best match from online NGOs considering blocked routes
    return await calculateBestMatch(ngos, victimRequest, requiredCapabilities, blockedRoutes);
  } catch (error) {
    console.error("Error finding best NGO:", error);
    throw error;
  }
}

/**
 * Calculate best match based on scoring algorithm
 * Now uses active offers to determine NGO capabilities dynamically
 */
async function calculateBestMatch(ngos, victimRequest, requiredCapabilities, blockedRoutes = []) {
  const { Offer } = await import("../models/Offer.js");
  
  // Get active offers for all NGOs
  const ngoIds = ngos.map(n => n._id);
  const activeOffers = await Offer.find({
    offeredBy: { $in: ngoIds },
    status: 'active',
    availableQuantity: { $gt: 0 }
  });

  // Group offers by NGO
  const offersByNGO = {};
  activeOffers.forEach(offer => {
    const ngoId = offer.offeredBy.toString();
    if (!offersByNGO[ngoId]) offersByNGO[ngoId] = [];
    offersByNGO[ngoId].push(offer);
  });

  const scoredNGOs = ngos.map((ngo) => {
    let score = 0;
    const ngoOffers = offersByNGO[ngo._id.toString()] || [];
    const ngoCapabilities = [...new Set(ngoOffers.map(o => o.category))];

    // 1. Capability match based on active offers (40 points max)
    let capabilityScore = 0;
    let matchedCapabilities = 0;
    requiredCapabilities.forEach((capability) => {
      if (ngoCapabilities.includes(capability)) {
        matchedCapabilities++;
      }
    });
    if (requiredCapabilities.length > 0) {
      capabilityScore = (matchedCapabilities / requiredCapabilities.length) * 40;
    } else {
      capabilityScore = 20; // Default if no specific needs
    }
    score += capabilityScore;

    // 2. Capacity score based on offer availability (20 points max)
    let totalAvailable = 0;
    let totalCapacity = 0;
    ngoOffers.forEach(offer => {
      totalAvailable += offer.availableQuantity;
      totalCapacity += offer.totalQuantity;
    });
    const capacityRatio = totalCapacity > 0 ? totalAvailable / totalCapacity : 0;
    const capacityScore = capacityRatio * 20;
    score += capacityScore;

    // 3. Load score (20 points max)
    const loadRatio = ngo.activeRequests / ngo.maxActiveRequests;
    const loadScore = (1 - loadRatio) * 20;
    score += loadScore;

    // 4. Rating score (10 points max)
    const ratingScore = (ngo.stats.rating / 5) * 10;
    score += ratingScore;

    // 5. Response time score (10 points max)
    const avgResponseMinutes = ngo.stats.averageResponseTime || 30;
    const responseScore = Math.max(0, 10 - (avgResponseMinutes / 60) * 10);
    score += responseScore;

    // 6. Route availability score (deduct points if route likely blocked)
    let routePenalty = 0;
    if (blockedRoutes.length > 0 && ngo.location?.coordinates && victimRequest.location?.coordinates) {
      const ngoCoords = ngo.location.coordinates;
      const victimCoords = victimRequest.location.coordinates;
      
      // Check if direct path between NGO and victim intersects any blocked route
      const isBlocked = blockedRoutes.some(route => 
        isRouteIntersecting(ngoCoords, victimCoords, route.coordinates, route.severity)
      );
      
      if (isBlocked) {
        routePenalty = 15; // Significant penalty for blocked routes
      }
    }
    score -= routePenalty;

    // 7. Priority boost for critical requests
    if (victimRequest.priority === "sos" || victimRequest.priority === "critical") {
      // Prioritize NGOs with rescue capability (from offers)
      if (ngoCapabilities.includes('rescue')) {
        score += 10;
      }
      // Prioritize online NGOs
      if (ngo.isOnline) {
        score += 5;
      }
    }

    return {
      ngo,
      score,
      details: {
        capabilityScore,
        capacityScore,
        loadScore,
        ratingScore,
        responseScore,
        routePenalty,
      },
    };
  });

  // Sort by score (highest first)
  scoredNGOs.sort((a, b) => b.score - a.score);

  // Return best match
  return scoredNGOs.length > 0 ? scoredNGOs[0].ngo : null;
}

/**
 * Get distance between two coordinates (Haversine formula)
 */
function getDistance(coords1, coords2) {
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;

  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Check if a direct route between two points intersects with a blocked route
 * Uses simplified buffer zone approach for performance
 */
function isRouteIntersecting(startCoords, endCoords, blockedCoords, severity = 'medium') {
  if (!Array.isArray(blockedCoords) || blockedCoords.length < 2) return false;
  
  // Buffer distance based on severity (meters)
  const bufferDistances = {
    low: 1000,      // 1km
    medium: 2000,   // 2km
    high: 5000,     // 5km
    critical: 10000 // 10km
  };
  const bufferDist = bufferDistances[severity] || 2000;
  
  // Check if start or end point is within buffer of any segment of the blocked route
  for (let i = 0; i < blockedCoords.length - 1; i++) {
    const segmentStart = blockedCoords[i];
    const segmentEnd = blockedCoords[i + 1];
    
    // Check if either endpoint is near this segment
    if (
      pointToSegmentDistance(startCoords, segmentStart, segmentEnd) < bufferDist ||
      pointToSegmentDistance(endCoords, segmentStart, segmentEnd) < bufferDist
    ) {
      return true;
    }
    
    // Check if the direct route line segment intersects with blocked route segment
    if (segmentsIntersect(startCoords, endCoords, segmentStart, segmentEnd, bufferDist)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate distance from a point to a line segment
 */
function pointToSegmentDistance(point, segStart, segEnd) {
  const [px, py] = point;
  const [x1, y1] = segStart;
  const [x2, y2] = segEnd;
  
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) param = dot / lenSq;
  
  let xx, yy;
  
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  
  const dx = px - xx;
  const dy = py - yy;
  
  // Convert to approximate meters (rough estimate for small distances)
  const distInDegrees = Math.sqrt(dx * dx + dy * dy);
  return distInDegrees * 111000; // ~111km per degree latitude
}

/**
 * Check if two line segments intersect or are within buffer distance
 */
function segmentsIntersect(p1, p2, p3, p4, buffer) {
  // Simplified: check if midpoint of one segment is within buffer of the other
  const mid1 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const mid2 = [(p3[0] + p4[0]) / 2, (p3[1] + p4[1]) / 2];
  
  const dist = getDistance(mid1, mid2);
  return dist < buffer;
}
