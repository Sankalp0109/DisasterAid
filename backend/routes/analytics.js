import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { getStats, exportData } from '../controllers/analyticsController.js';

const router = express.Router();

// Get dashboard statistics
router.get('/stats', authenticate, authorize('authority', 'admin', 'operator'), getStats);

// Export data
router.get('/export/:type', authenticate, authorize('authority', 'admin', 'operator'), exportData);

// Export individual request data
router.get('/export-request/:requestId', authenticate, authorize('authority', 'admin', 'operator'), exportData);

export default router;
