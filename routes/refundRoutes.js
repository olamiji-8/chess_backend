const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const ClawbackController = require('../controllers/refundController');

/**
 * REFUND MANAGEMENT ROUTES
 * Base route: /api/refunds
 */

// Admin routes (protected with admin privileges)
router.post('/create', protect, adminOnly, ClawbackController.createClawback);
router.post('/bulk', protect, adminOnly, ClawbackController.bulkClawback);
router.post('/all-funds', protect, adminOnly, ClawbackController.clawbackAllFunds);
router.get('/all', protect, adminOnly, ClawbackController.getAllClawbacks);

module.exports = router;