import { Request } from "../models/Request.js";
import { Offer } from "../models/Offer.js";
import { NGO } from "../models/NGO.js";
import { Assignment } from "../models/Assignment.js";
import { MATCHING_WEIGHTS } from "../config/matchingWeights.js";

/**
 * Calculate distance between two coordinates
 */
function calculateDistance(coords1, coords2) {
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;

  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Find best offers for a request category
 */
export async function findBestOffers(request, category, quantity = 1) {
  try {
    const requestCoords = request.location?.coordinates;
    if (!requestCoords) return [];

    // Find active offers in the category
    const offers = await Offer.find({
      category,
      status: "active",
      availableQuantity: { $gte: quantity },
      "location.coordinates": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: requestCoords,
          },
          $maxDistance: 100000, // 100km
        },
      },
    })
      .populate("offeredBy", "name rating stats")
      .limit(10);

    // Score offers
    const scoredOffers = offers.map((offer) => {
      let score = 0;

  // Distance score (40 points)
      const distance = calculateDistance(requestCoords, offer.location.coordinates);
      const distanceScore = Math.max(0, 40 - (distance / 1000) * 0.4);
      score += distanceScore;

      // Quantity availability (20 points)
      const quantityRatio = offer.availableQuantity / offer.totalQuantity;
      score += quantityRatio * 20;

      // NGO rating (20 points)
      if (offer.offeredBy?.stats?.rating) {
        score += (offer.offeredBy.stats.rating / 5) * 20;
      }

      // Response time (10 points)
      if (offer.offeredBy?.stats?.averageResponseTime) {
        const responseScore = Math.max(
          0,
          10 - (offer.offeredBy.stats.averageResponseTime / 60) * 10
        );
        score += responseScore;
      }

      // Priority boost (scaled)
      const pb = MATCHING_WEIGHTS.priorityBoost[request.priority] || 0;
      score += pb * 0.4; // Offers get partial priority influence

      // Verification bonus
      if (offer.isVerified) {
        score += 5;
      }

      return {
        offer,
        score,
        distance,
      };
    });

    // Sort by score
    scoredOffers.sort((a, b) => b.score - a.score);

    return scoredOffers;
  } catch (error) {
    console.error("Error finding best offers:", error);
    return [];
  }
}

/**
 * Find best NGO for auto-assignment (when no offers available)
 * Now queries active offers to determine NGO capabilities dynamically
 */
export async function findBestNGO(request) {
  try {
    const requestCoords = request.location?.coordinates;
    if (!requestCoords) return null;

    // Get required capabilities
    const requiredCapabilities = [];
    if (request.needs) {
      Object.keys(request.needs).forEach((need) => {
        if (request.needs[need]?.required) {
          requiredCapabilities.push(need);
        }
      });
    }

    // Find NGOs
    const ngos = await NGO.find({
      isActive: true,
      isVerified: true,
      "location.coordinates": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: requestCoords,
          },
          $maxDistance: 100000,
        },
      },
    }).limit(20);

    if (ngos.length === 0) return null;

    // Get active offers for each NGO to determine capabilities
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

    // Score NGOs
    const scoredNGOs = ngos.map((ngo) => {
      let score = 0;
      const ngoOffers = offersByNGO[ngo._id.toString()] || [];
      const ngoCapabilities = [...new Set(ngoOffers.map(o => o.category))];

      // Capability match based on active offers
      let matchedCapabilities = 0;
      requiredCapabilities.forEach((cap) => {
        if (ngoCapabilities.includes(cap)) matchedCapabilities++;
      });
      if (requiredCapabilities.length > 0) {
        score += (matchedCapabilities / requiredCapabilities.length) * MATCHING_WEIGHTS.capability;
      } else {
        score += MATCHING_WEIGHTS.capability * 0.5; // Default partial score when no specific needs
      }

      // Capacity based on offer availability
      let totalAvailable = 0;
      let totalCapacity = 0;
      ngoOffers.forEach(offer => {
        totalAvailable += offer.availableQuantity;
        totalCapacity += offer.totalQuantity;
      });
      const capacityRatio = totalCapacity > 0 ? totalAvailable / totalCapacity : 0;
      score += capacityRatio * MATCHING_WEIGHTS.capacity;

      // Load (inverse of active ratio)
      const loadRatio = ngo.activeAssignments / ngo.maxActiveAssignments;
      score += (1 - loadRatio) * MATCHING_WEIGHTS.load;

      // Rating
      score += (ngo.stats.rating / 5) * MATCHING_WEIGHTS.rating;

      // Response time
      const avgResponse = ngo.stats.averageResponseTime || 30;
      score += Math.max(0, MATCHING_WEIGHTS.response - (avgResponse / 60) * MATCHING_WEIGHTS.response);

      // Priority boost (full influence for NGO auto-match)
      score += MATCHING_WEIGHTS.priorityBoost[request.priority] || 0;
      if ((request.priority === "sos" || request.priority === "critical") && ngoCapabilities.includes('rescue')) {
        score += MATCHING_WEIGHTS.rescueBoost;
      }
      if (ngo.isOnline) score += MATCHING_WEIGHTS.onlineBoost;

      // 24x7 availability
      if (ngo.available24x7) score += MATCHING_WEIGHTS.twentyFourSeven;

      return { ngo, score };
    });

  scoredNGOs.sort((a, b) => b.score - a.score);

    return scoredNGOs[0]?.ngo || null;
  } catch (error) {
    console.error("Error finding best NGO:", error);
    return null;
  }
}

/**
 * Create assignment from offer
 */
export async function createAssignmentFromOffer(request, offer, quantity) {
  try {
    // Allocate from offer
    const allocated = offer.allocate(quantity);
    if (!allocated) {
      throw new Error("Insufficient quantity in offer");
    }
    await offer.save();

    // Create assignment
    const assignment = new Assignment({
      request: request._id,
      offer: offer._id,
      assignedTo: offer.offeredBy,
      category: offer.category,
      quantity,
      priority: request.priority,
      assignmentMethod: "offer-match",
      deliveryLocation: {
        type: "Point",
        coordinates: request.location.coordinates,
        address: request.location.address,
      },
      pickupLocation: {
        type: "Point",
        coordinates: offer.location.coordinates,
        address: offer.location.address,
      },
    });

    await assignment.save();

    // Update request
    request.assignments.push(assignment._id);
    if (request.status === "new") {
      request.status = "assigned";
    }
    await request.save();

    // Update NGO
    const ngo = await NGO.findById(offer.offeredBy);
    if (ngo) {
      ngo.activeAssignments += 1;
      await ngo.save();
    }

    return assignment;
  } catch (error) {
    console.error("Error creating assignment from offer:", error);
    throw error;
  }
}

/**
 * Create assignment from NGO (auto-match)
 */
export async function createAssignmentFromNGO(request, ngo, category) {
  try {
    const assignment = new Assignment({
      request: request._id,
      assignedTo: ngo._id,
      category,
      priority: request.priority,
      assignmentMethod: "auto",
      deliveryLocation: {
        type: "Point",
        coordinates: request.location.coordinates,
        address: request.location.address,
      },
    });

    await assignment.save();

    // Update request
    request.assignments.push(assignment._id);
    if (request.status === "new") {
      request.status = "assigned";
    }
    await request.save();

    // Update NGO
    ngo.activeAssignments += 1;
    await ngo.save();

    return assignment;
  } catch (error) {
    console.error("Error creating assignment from NGO:", error);
    throw error;
  }
}

/**
 * Auto-match request to offers and NGOs
 */
export async function autoMatchRequest(requestId) {
  try {
    const request = await Request.findById(requestId);
    if (!request) return { success: false, message: "Request not found" };

    const assignments = [];
    // Convert needs to plain object to properly iterate (Mongoose subdocument issue)
    const needsObj = request.needs?.toObject ? request.needs.toObject() : request.needs;
    const requiredNeeds = Object.keys(needsObj || {}).filter(
      (k) => needsObj[k]?.required
    );

    // Fallback: if no explicit required need was marked, attempt a generic NGO assignment
    if (requiredNeeds.length === 0) {
      const ngo = await findBestNGO(request);
      if (ngo) {
        const assignment = await createAssignmentFromNGO(request, ngo, 'general');
        assignments.push(assignment);
        return {
          success: true,
          assignments,
          message: `Created 1 generic assignment (priority: ${request.priority})`,
        };
      }
      // No NGO found; continue returning empty assignments after loop below
    }

    for (const need of requiredNeeds) {
      const quantity = needsObj[need].quantity || 1;

      // Try to find offers first
      const offers = await findBestOffers(request, need, quantity);

      if (offers.length > 0) {
        // Create assignment from best offer
        const assignment = await createAssignmentFromOffer(
          request,
          offers[0].offer,
          quantity
        );
        assignments.push(assignment);
      } else {
        // Fall back to NGO auto-match
        const ngo = await findBestNGO(request);
        if (ngo) {
          const assignment = await createAssignmentFromNGO(request, ngo, need);
          assignments.push(assignment);
        }
      }
    }

    return {
      success: true,
      assignments,
      message: `Created ${assignments.length} assignments (priority: ${request.priority})`,
    };
  } catch (error) {
    console.error("Error in auto-match:", error);
    return { success: false, message: error.message };
  }
}

/**
 * Get unmet demand statistics
 */
export async function getUnmetDemand() {
  try {
    const unmetRequests = await Request.aggregate([
      {
        $match: {
          status: { $in: ["new", "triaged"] },
        },
      },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          totalBeneficiaries: { $sum: "$beneficiaries.total" },
          rescueNeeded: {
            $sum: { $cond: ["$needs.rescue.required", 1, 0] },
          },
          foodNeeded: {
            $sum: { $cond: ["$needs.food.required", "$needs.food.quantity", 0] },
          },
          waterNeeded: {
            $sum: { $cond: ["$needs.water.required", "$needs.water.quantity", 0] },
          },
          medicalNeeded: {
            $sum: { $cond: ["$needs.medical.required", 1, 0] },
          },
          shelterNeeded: {
            $sum: { $cond: ["$needs.shelter.required", 1, 0] },
          },
        },
      },
    ]);

    return unmetRequests[0] || {};
  } catch (error) {
    console.error("Error getting unmet demand:", error);
    return {};
  }
}
