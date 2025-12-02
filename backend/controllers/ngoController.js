import { NGO } from "../models/NGO.js";
import { AuditLog } from "../models/AuditLog.js";

// Get current NGO's info
export const getMyNGO = async (req, res) => {
  try {
    // NGO is linked via user's organizationId
    if (!req.user.organizationId) {
      return res.status(404).json({ success: false, message: "No NGO organization linked to this account" });
    }
    
    const ngo = await NGO.findById(req.user.organizationId);
    if (!ngo) {
      return res.status(404).json({ success: false, message: "NGO profile not found" });
    }
    res.json({ success: true, ngo });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch NGO info", error: err.message });
  }
};

// Update NGO location
export const updateMyLocation = async (req, res) => {
  try {
    const { location } = req.body;
    
    if (!location || !location.coordinates || location.coordinates.length !== 2) {
      return res.status(400).json({ 
        success: false, 
        message: "Valid location with coordinates is required" 
      });
    }

    // NGO is linked via user's organizationId
    if (!req.user.organizationId) {
      return res.status(404).json({ success: false, message: "No NGO organization linked to this account" });
    }

    const ngo = await NGO.findById(req.user.organizationId);
    if (!ngo) {
      return res.status(404).json({ success: false, message: "NGO profile not found" });
    }

    const oldLocation = ngo.location;
    ngo.location = {
      type: "Point",
      coordinates: location.coordinates,
      address: location.address || `${location.coordinates[1]}, ${location.coordinates[0]}`
    };
    
    await ngo.save();

    // Audit log
    await AuditLog.log({
      action: "ngo_location_updated",
      performedBy: req.user._id,
      performedByRole: req.user.role,
      targetType: "NGO",
      targetId: ngo._id,
      details: {
        oldLocation: oldLocation?.address || 'Not set',
        newLocation: ngo.location.address
      }
    });

    console.log(`📍 NGO location updated: ${ngo.name}`);
    
    res.json({ 
      success: true, 
      message: "Location updated successfully",
      ngo 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update location", error: err.message });
  }
};

// List NGOs for authority map overlays
export const listNGOs = async (req, res) => {
  try {
    const { activeOnly = "true" } = req.query;
    const query = {};
    if (activeOnly === "true") {
      query.isActive = true;
    }
    const ngos = await NGO.find(query)
      .select("name location coverageRadius isActive isVerified stats.peopleHelped");

    res.json({ success: true, ngos });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch NGOs", error: err.message });
  }
};
