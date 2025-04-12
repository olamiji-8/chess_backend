const Notification = require('../models/Notification');
const User = require('../models/User');
const asyncHandler = require('express-async-handler');

// Utility function to create notifications
exports.createNotification = async (userId, title, message, type, relatedId = null, relatedModel = null) => {
  try {
    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type,
      relatedId,
      relatedModel
    });
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// @desc    Get user notifications with pagination
// @route   GET /api/notifications
// @access  Private
exports.getUserNotifications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const startIndex = (page - 1) * limit;
  const filterRead = req.query.read === 'true' ? true : req.query.read === 'false' ? false : null;
  
  let query = { user: req.user.id };
  
  // Filter by read/unread status if specified
  if (filterRead !== null) {
    query.isRead = filterRead;
  }
  
  const total = await Notification.countDocuments(query);
  
  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(startIndex)
    .limit(limit)
    .populate('relatedId', 'title startDate status');
  
  // Count unread notifications
  const unreadCount = await Notification.countDocuments({ 
    user: req.user.id,
    isRead: false
  });
  
  res.status(200).json({
    success: true,
    count: notifications.length,
    total,
    unreadCount,
    pagination: {
      current: page,
      totalPages: Math.ceil(total / limit)
    },
    data: notifications
  });
});

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  
  if (!notification) {
    return res.status(404).json({ message: 'Notification not found' });
  }
  
  // Check if notification belongs to current user
  if (notification.user.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized to access this notification' });
  }
  
  notification.isRead = true;
  await notification.save();
  
  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
    data: notification
  });
});

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user.id, isRead: false },
    { isRead: true }
  );
  
  res.status(200).json({
    success: true,
    message: 'All notifications marked as read'
  });
});

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  
  if (!notification) {
    return res.status(404).json({ message: 'Notification not found' });
  }
  
  // Check if notification belongs to current user
  if (notification.user.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized to delete this notification' });
  }
  
  await notification.deleteOne();
  
  res.status(200).json({
    success: true,
    message: 'Notification deleted'
  });
});

// @desc    Delete all read notifications
// @route   DELETE /api/notifications/clear-read
// @access  Private
exports.clearReadNotifications = asyncHandler(async (req, res) => {
  const result = await Notification.deleteMany({
    user: req.user.id,
    isRead: true
  });
  
  res.status(200).json({
    success: true,
    message: `${result.deletedCount} read notifications deleted`
  });
});