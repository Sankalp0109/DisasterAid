import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listActiveBlockedRoutes, createBlockedRoute, deactivateBlockedRoute } from '../controllers/blockedRouteController.js';

const router = express.Router();

// Public can read active blocked routes (for frontend map display)
router.get('/', listActiveBlockedRoutes);

// Authority & admin can create/deactivate
router.post('/', authenticate, authorize('authority','admin'), createBlockedRoute);
router.patch('/:id/deactivate', authenticate, authorize('authority','admin'), deactivateBlockedRoute);

export default router;
