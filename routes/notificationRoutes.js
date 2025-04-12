const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearReadNotifications
} = require('../controllers/notificationController');

// Base route: /api/notifications
router.get('/', protect, getUserNotifications);
router.put('/:id/read', protect, markNotificationRead);
router.put('/read-all', protect, markAllNotificationsRead);
router.delete('/:id', protect, deleteNotification);
router.delete('/clear-read', protect, clearReadNotifications);

module.exports = router;