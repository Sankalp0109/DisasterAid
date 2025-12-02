import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listActiveAdvisories, createAdvisory, deactivateAdvisory } from '../controllers/advisoryController.js';

const router = express.Router();

// Public can read active advisories (so they're always visible on app load)
router.get('/', listActiveAdvisories);

// Authority & admin can create/deactivate
router.post('/', authenticate, authorize('authority','admin'), createAdvisory);
router.patch('/:id/deactivate', authenticate, authorize('authority','admin'), deactivateAdvisory);

export default router;
