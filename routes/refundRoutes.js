const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const RefundController = require('../controllers/refundController');

/**
 * REFUND MANAGEMENT ROUTES
 * Base route: /api/refunds
 */

// Admin routes (protected with admin privileges)
router.post('/create', protect, adminOnly, RefundController.createRefund);
router.get('/all', protect, adminOnly, RefundController.getAllRefunds);
router.post('/bulk', protect, adminOnly, RefundController.bulkRefund);
router.get('/details/:refundId', protect, adminOnly, RefundController.getRefundDetails);

module.exports = router;