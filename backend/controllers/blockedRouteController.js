import { BlockedRoute } from '../models/BlockedRoute.js';
import { AuditLog } from '../models/AuditLog.js';

export const listActiveBlockedRoutes = async (req, res) => {
  try {
    const routes = await BlockedRoute.findActive();
    res.json({ success: true, blockedRoutes: routes });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch blocked routes', error: err.message });
  }
};

export const createBlockedRoute = async (req, res) => {
  try {
    const { name, reason, severity = 'medium', coordinates, expiresAt } = req.body;
    
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid coordinates array with at least 2 points required' 
      });
    }

    const blockedRoute = await BlockedRoute.create({ 
      name, 
      reason, 
      severity, 
      coordinates, 
      expiresAt, 
      createdBy: req.userId 
    });

    await AuditLog.log({
      action: 'blocked_route_create',
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: 'BlockedRoute',
      targetId: blockedRoute._id,
      details: { name, severity }
    });

    res.status(201).json({ success: true, blockedRoute });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create blocked route', error: err.message });
  }
};

export const deactivateBlockedRoute = async (req, res) => {
  try {
    const { id } = req.params;
    const blockedRoute = await BlockedRoute.findByIdAndUpdate(id, { active: false }, { new: true });
    
    if (!blockedRoute) {
      return res.status(404).json({ success: false, message: 'Blocked route not found' });
    }

    await AuditLog.log({
      action: 'blocked_route_deactivate',
      performedBy: req.userId,
      performedByRole: req.userRole,
      targetType: 'BlockedRoute',
      targetId: blockedRoute._id
    });

    res.json({ success: true, blockedRoute });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to deactivate blocked route', error: err.message });
  }
};
