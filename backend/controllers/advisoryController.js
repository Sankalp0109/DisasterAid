import { Advisory } from "../models/Advisory.js";
import { AuditLog } from "../models/AuditLog.js";

export const listActiveAdvisories = async (req, res) => {
  try {
    const advisories = await Advisory.findActive();
    res.json({ success: true, advisories });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch advisories', error: err.message });
  }
};

export const createAdvisory = async (req, res) => {
  try {
    const { title, message, severity = 'info', tags = [], active = true, expiresAt } = req.body;
    const advisory = await Advisory.create({ title, message, severity, tags, active, expiresAt, issuedBy: req.userId });
    await AuditLog.log({ action: 'advisory_create', performedBy: req.userId, performedByRole: req.userRole, targetType: 'Advisory', targetId: advisory._id, details: { severity } });
    res.status(201).json({ success: true, advisory });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create advisory', error: err.message });
  }
};

export const deactivateAdvisory = async (req, res) => {
  try {
    const { id } = req.params;
    const advisory = await Advisory.findByIdAndUpdate(id, { active: false }, { new: true });
    if (!advisory) return res.status(404).json({ success: false, message: 'Advisory not found' });
    await AuditLog.log({ action: 'advisory_deactivate', performedBy: req.userId, performedByRole: req.userRole, targetType: 'Advisory', targetId: advisory._id });
    res.json({ success: true, advisory });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to deactivate advisory', error: err.message });
  }
};
