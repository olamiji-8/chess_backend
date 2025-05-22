const express = require('express');
const router = express.Router();
const {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearReadNotifications,
  getNotificationStats
} = require('../controllers/notificationController');

// Import auth middleware (assuming you have authentication middleware)
const { protect } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(protect);

// @route   GET /api/notifications
// @desc    Get user notifications with pagination and filtering
// @access  Private
router.get('/', getUserNotifications);

// @route   GET /api/notifications/stats
// @desc    Get notification statistics
// @access  Private
router.get('/stats', getNotificationStats);

// @route   PUT /api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/read-all', markAllNotificationsRead);

// @route   DELETE /api/notifications/clear-read
// @desc    Delete all read notifications
// @access  Private
router.delete('/clear-read', clearReadNotifications);

// @route   PUT /api/notifications/:id/read
// @desc    Mark specific notification as read
// @access  Private
router.put('/:id/read', markNotificationRead);

// @route   DELETE /api/notifications/:id
// @desc    Delete a specific notification
// @access  Private
router.delete('/:id', deleteNotification);

module.exports = router;