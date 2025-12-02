import { Offer } from "../models/Offer.js";
import { NGO } from "../models/NGO.js";
import { AuditLog } from "../models/AuditLog.js";
import { getIO } from "../socket/ioInstance.js";

// Create offer
export const createOffer = async (req, res) => {
  try {
    // Get user's NGO
    const user = await req.user.populate("organizationId");
    
    if (!user.organizationId) {
      return res.status(400).json({
        success: false,
        message: "No NGO associated with this account",
      });
    }

    // Basic validation
    if (!req.body?.category || !req.body?.title || !req.body?.totalQuantity) {
      return res.status(400).json({ success: false, message: "category, title and totalQuantity are required" });
    }

    const offerData = {
      ...req.body,
      offeredBy: user.organizationId._id,
      createdByUser: req.userId,
      availableQuantity: req.body.totalQuantity,
    };

    // Handle location - save to NGO if it's their first offer and they provided location
    const ngo = user.organizationId;
    if (offerData.location && offerData.location.coordinates && offerData.location.coordinates.length === 2) {
      // If NGO doesn't have a location yet, save this as their base location
      if (!ngo.location || !ngo.location.coordinates || ngo.location.coordinates.length !== 2) {
        ngo.location = {
          type: "Point",
          coordinates: offerData.location.coordinates,
          address: offerData.location.address || undefined,
        };
        await ngo.save();
        console.log(`📍 NGO base location set: ${ngo.name}`);
      }
    } else if (!offerData.location || !offerData.location.coordinates || offerData.location.coordinates.length !== 2) {
      // If no location provided, use NGO's saved location
      if (ngo?.location?.coordinates?.length === 2) {
        offerData.location = {
          type: "Point",
          coordinates: ngo.location.coordinates,
          address: ngo.location.address || undefined,
        };
      } else {
        return res.status(400).json({ success: false, message: "Offer location required (NGO has no default location set)" });
      }
    }

    // Default coverageRadius if not provided
    if (!offerData.coverageRadius) {
      offerData.coverageRadius = user.organizationId.coverageRadius || 10000;
    }

    const offer = new Offer(offerData);
    await offer.save();

    // Audit log
    await AuditLog.log({
      action: "offer_create",
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: "Offer",
      targetId: offer._id,
      details: { category: offer.category, quantity: offer.totalQuantity },
    });

    res.status(201).json({
      success: true,
      message: "Offer created successfully",
      offer,
    });
  } catch (error) {
    console.error("Create offer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create offer",
      error: error.message,
    });
  }
};

// Get all offers
export const getOffers = async (req, res) => {
  try {
    const {
      category,
      status = "active",
      ngoId,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};

    if (category) query.category = category;
    if (status) query.status = status;
    
    // If NGO user, show only their offers
    if (req.userRole === "ngo") {
      const user = await req.user.populate("organizationId");
      query.offeredBy = user.organizationId._id;
    } else if (ngoId) {
      query.offeredBy = ngoId;
    }

    const offers = await Offer.find(query)
      .populate("offeredBy", "name location")
      .sort("-createdAt")
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Offer.countDocuments(query);

    res.json({
      success: true,
      offers,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get offers",
      error: error.message,
    });
  }
};

// Get offer by ID
export const getOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id)
      .populate("offeredBy", "name email phone location")
      .populate("assignments");

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    res.json({
      success: true,
      offer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get offer",
      error: error.message,
    });
  }
};

// Update offer
export const updateOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    // Check ownership
    const user = await req.user.populate("organizationId");
    if (offer.offeredBy.toString() !== user.organizationId._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const oldData = offer.toObject();
    const { title, description, totalQuantity, unit, location, status, coverageRadius } = req.body;

    // Update allowed fields
    if (title) offer.title = title;
    if (description) offer.description = description;
    
    // Update quantity (can only increase or keep same, not decrease if allocated)
    if (totalQuantity !== undefined) {
      const previousTotal = offer.totalQuantity;
      const allocated = previousTotal - offer.availableQuantity;
      
      if (totalQuantity < allocated) {
        return res.status(400).json({
          success: false,
          message: `Cannot reduce total below allocated quantity (${allocated})`
        });
      }

      // Adjust available quantity based on new total
      offer.availableQuantity += (totalQuantity - previousTotal);
      offer.totalQuantity = totalQuantity;
    }

    if (unit) offer.unit = unit;
    if (location && location.coordinates) {
      offer.location = {
        type: "Point",
        coordinates: location.coordinates,
        address: location.address || offer.location.address
      };
    }
    if (status && ['active', 'paused', 'exhausted', 'expired', 'cancelled'].includes(status)) {
      offer.status = status;
    }
    if (coverageRadius) offer.coverageRadius = coverageRadius;

    offer.updatedAt = new Date();
    await offer.save();

    // Audit log
    await AuditLog.log({
      action: "offer_update",
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: "Offer",
      targetId: offer._id,
      changes: { before: oldData, after: offer.toObject() },
    });

    // Emit Socket.IO events for real-time updates
    try {
      const io = getIO();
      
      // Notify NGO dashboard room
      io.to(`ngo:${offer.offeredBy}`).emit('offer:updated', {
        offerId: offer._id,
        title: offer.title,
        status: offer.status,
        availableQuantity: offer.availableQuantity,
        totalQuantity: offer.totalQuantity,
        timestamp: new Date()
      });

      // Notify all role dashboards that inventory changed
      io.to('role:authority').to('role:operator').emit('inventory:changed', {
        offerId: offer._id,
        ngoId: offer.offeredBy,
        status: offer.status,
        availableQuantity: offer.availableQuantity,
        timestamp: new Date()
      });
    } catch (err) {
      console.warn('Socket.IO emission failed:', err.message);
    }

    res.json({
      success: true,
      message: "Offer updated successfully",
      offer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update offer",
      error: error.message,
    });
  }
};

export const deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    // Check ownership
    const user = await req.user.populate("organizationId");
    if (offer.offeredBy.toString() !== user.organizationId._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Instead of deleting, mark as cancelled
    // This preserves audit trail and prevents accidental data loss
    offer.status = 'cancelled';
    offer.updatedAt = new Date();
    await offer.save();

    // Audit log
    await AuditLog.log({
      action: "offer_cancelled",
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: "Offer",
      targetId: offer._id,
      details: { category: offer.category, reason: 'NGO cancelled offer' }
    });

    res.json({
      success: true,
      message: "Offer cancelled successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to cancel offer",
      error: error.message,
    });
  }
};

// Pause/Resume offer
export const toggleOfferStatus = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    // Check ownership
    const user = await req.user.populate("organizationId");
    if (offer.offeredBy.toString() !== user.organizationId._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (offer.status === "active") {
      offer.status = "paused";
    } else if (offer.status === "paused") {
      offer.status = "active";
    }

    await offer.save();

    res.json({
      success: true,
      message: `Offer ${offer.status}`,
      offer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to toggle offer status",
      error: error.message,
    });
  }
};

// Get offers by location
export const getOffersByLocation = async (req, res) => {
  try {
    const { longitude, latitude, radius = 50000, category } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: "Longitude and latitude required",
      });
    }

    const query = {
      status: "active",
      availableQuantity: { $gt: 0 },
      "location.coordinates": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseInt(radius),
        },
      },
    };

    if (category) query.category = category;

    const offers = await Offer.find(query)
      .populate("offeredBy", "name phone")
      .limit(50);

    res.json({
      success: true,
      offers,
      count: offers.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get offers by location",
      error: error.message,
    });
  }
};

// Get offer statistics
export const getOfferStats = async (req, res) => {
  try {
    const user = await req.user.populate("organizationId");
    
    const stats = await Offer.aggregate([
      {
        $match: {
          offeredBy: user.organizationId._id,
        },
      },
      {
        $group: {
          _id: "$category",
          totalOffers: { $sum: 1 },
          activeOffers: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
          totalQuantity: { $sum: "$totalQuantity" },
          availableQuantity: { $sum: "$availableQuantity" },
          totalAllocated: { $sum: "$stats.totalAllocated" },
          totalFulfilled: { $sum: "$stats.totalFulfilled" },
          peopleHelped: { $sum: "$stats.peopleHelped" },
        },
      },
    ]);

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get offer statistics",
      error: error.message,
    });
  }
};
