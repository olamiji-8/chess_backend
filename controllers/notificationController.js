const Notification = require('../models/Notification');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const VerificationRequest = require('../models/verification');
const Transaction = require('../models/Transaction');
const asyncHandler = require('express-async-handler');

// ==================== UTILITY FUNCTIONS ====================

// Base utility function to create notifications
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

// Send notification to multiple users
exports.createBulkNotifications = async (userIds, title, message, type, relatedId = null, relatedModel = null) => {
  try {
    const notifications = userIds.map(userId => ({
      user: userId,
      title,
      message,
      type,
      relatedId,
      relatedModel
    }));
    
    const createdNotifications = await Notification.insertMany(notifications);
    return createdNotifications;
  } catch (error) {
    console.error('Error creating bulk notifications:', error);
    return null;
  }
};

// ==================== VERIFICATION NOTIFICATIONS ====================

// Notify user when verification request is submitted
exports.notifyVerificationSubmitted = async (userId, verificationRequestId) => {
  return await exports.createNotification(
    userId,
    'Verification Submitted',
    'Your identity verification request has been submitted successfully. We will review it within 24-48 hours.',
    'account_verification',
    verificationRequestId,
    'VerificationRequest'
  );
};

// Notify user when verification is approved
exports.notifyVerificationApproved = async (userId, verificationRequestId) => {
  return await exports.createNotification(
    userId,
    'Verification Approved',
    'Congratulations! Your identity verification has been approved. You can now access all platform features.',
    'account_verification',
    verificationRequestId,
    'VerificationRequest'
  );
};

// Notify user when verification is rejected
exports.notifyVerificationRejected = async (userId, verificationRequestId, reason) => {
  return await exports.createNotification(
    userId,
    'Verification Rejected',
    `Your identity verification has been rejected. Reason: ${reason}. Please submit a new request with correct information.`,
    'account_verification',
    verificationRequestId,
    'VerificationRequest'
  );
};

// Notify admins of new verification request
exports.notifyAdminsNewVerification = async (verificationRequestId, userName) => {
  try {
    const admins = await User.find({ role: 'admin' });
    const adminIds = admins.map(admin => admin._id);
    
    return await exports.createBulkNotifications(
      adminIds,
      'New Verification Request',
      `${userName} has submitted a new identity verification request that requires review.`,
      'account_verification',
      verificationRequestId,
      'VerificationRequest'
    );
  } catch (error) {
    console.error('Error notifying admins:', error);
    return null;
  }
};

// ==================== TOURNAMENT NOTIFICATIONS ====================

// Notify when tournament is created
exports.notifyTournamentCreated = async (organizerId, tournamentId, tournamentTitle) => {
  return await exports.createNotification(
    organizerId,
    'Tournament Created',
    `Your tournament "${tournamentTitle}" has been created successfully and is now live for registrations.`,
    'tournament_created',
    tournamentId,
    'Tournament'
  );
};

// Notify user when they register for a tournament
exports.notifyTournamentRegistration = async (userId, tournamentId, tournamentTitle) => {
  return await exports.createNotification(
    userId,
    'Tournament Registration Confirmed',
    `You have successfully registered for "${tournamentTitle}". Good luck!`,
    'tournament_registration',
    tournamentId,
    'Tournament'
  );
};

// Notify tournament organizer when someone registers
exports.notifyOrganizerNewRegistration = async (organizerId, tournamentId, tournamentTitle, participantName) => {
  return await exports.createNotification(
    organizerId,
    'New Tournament Registration',
    `${participantName} has registered for your tournament "${tournamentTitle}".`,
    'tournament_registration',
    tournamentId,
    'Tournament'
  );
};

// Notify participants about tournament starting soon (reminder)
exports.notifyTournamentReminder = async (tournamentId, hoursBeforeStart = 1) => {
  try {
    const tournament = await Tournament.findById(tournamentId).populate('participants', '_id');
    if (!tournament) return null;
    
    const participantIds = tournament.participants.map(p => p._id);
    
    return await exports.createBulkNotifications(
      participantIds,
      'Tournament Starting Soon',
      `Reminder: "${tournament.title}" starts in ${hoursBeforeStart} hour(s). Make sure you're ready!`,
      'tournament_reminder',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament reminders:', error);
    return null;
  }
};

// Notify participants when tournament starts
exports.notifyTournamentStarted = async (tournamentId) => {
  try {
    const tournament = await Tournament.findById(tournamentId).populate('participants', '_id');
    if (!tournament) return null;
    
    const participantIds = tournament.participants.map(p => p._id);
    
    return await exports.createBulkNotifications(
      participantIds,
      'Tournament Started',
      `"${tournament.title}" has started! Join now using the tournament link.`,
      'tournament_reminder',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error notifying tournament start:', error);
    return null;
  }
};

// Notify about tournament results/completion
exports.notifyTournamentCompleted = async (tournamentId) => {
  try {
    const tournament = await Tournament.findById(tournamentId).populate('participants', '_id');
    if (!tournament) return null;
    
    const participantIds = tournament.participants.map(p => p._id);
    
    return await exports.createBulkNotifications(
      participantIds,
      'Tournament Completed',
      `"${tournament.title}" has been completed. Check the results and prize distributions.`,
      'tournament_result',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error notifying tournament completion:', error);
    return null;
  }
};

// Notify tournament cancellation
exports.notifyTournamentCancelled = async (tournamentId, reason = '') => {
  try {
    const tournament = await Tournament.findById(tournamentId).populate('participants', '_id');
    if (!tournament) return null;
    
    const participantIds = tournament.participants.map(p => p._id);
    const reasonText = reason ? ` Reason: ${reason}` : '';
    
    return await exports.createBulkNotifications(
      participantIds,
      'Tournament Cancelled',
      `"${tournament.title}" has been cancelled.${reasonText} Entry fees will be refunded automatically.`,
      'tournament_result',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error notifying tournament cancellation:', error);
    return null;
  }
};

// ==================== TRANSACTION NOTIFICATIONS ====================

// Notify successful transaction
exports.notifyTransactionSuccess = async (userId, transactionId, type, amount) => {
  const typeMessages = {
    deposit: `Your wallet has been credited with ₦${amount.toLocaleString()}.`,
    withdrawal: `Your withdrawal of ₦${amount.toLocaleString()} has been processed successfully.`,
    tournament_entry: `Tournament entry fee of ₦${amount.toLocaleString()} has been deducted from your wallet.`,
    tournament_funding: `Tournament funding of ₦${amount.toLocaleString()} has been processed.`,
    prize_payout: `Congratulations! You've received a prize payout of ₦${amount.toLocaleString()}.`,
    refund: `A refund of ₦${amount.toLocaleString()} has been credited to your wallet.`
  };
  
  return await exports.createNotification(
    userId,
    'Transaction Successful',
    typeMessages[type] || `Your transaction of ₦${amount.toLocaleString()} was successful.`,
    'transaction_success',
    transactionId,
    'Transaction'
  );
};

// Notify failed transaction
exports.notifyTransactionFailed = async (userId, transactionId, type, amount, reason = '') => {
  const reasonText = reason ? ` Reason: ${reason}` : '';
  
  return await exports.createNotification(
    userId,
    'Transaction Failed',
    `Your ${type.replace('_', ' ')} transaction of ₦${amount.toLocaleString()} failed.${reasonText} Please try again or contact support.`,
    'transaction_failed',
    transactionId,
    'Transaction'
  );
};

// Notify pending transaction
exports.notifyTransactionPending = async (userId, transactionId, type, amount) => {
  return await exports.createNotification(
    userId,
    'Transaction Pending',
    `Your ${type.replace('_', ' ')} transaction of ₦${amount.toLocaleString()} is being processed. You'll be notified once it's completed.`,
    'transaction_success',
    transactionId,
    'Transaction'
  );
};

// ==================== WALLET NOTIFICATIONS ====================

// Notify wallet balance update
exports.notifyWalletUpdate = async (userId, newBalance, changeAmount, type) => {
  const changeText = changeAmount > 0 ? `increased by ₦${changeAmount.toLocaleString()}` : `decreased by ₦${Math.abs(changeAmount).toLocaleString()}`;
  
  return await exports.createNotification(
    userId,
    'Wallet Update',
    `Your wallet balance has been ${changeText}. Current balance: ₦${newBalance.toLocaleString()}.`,
    'wallet_update',
    null,
    null
  );
};

// Notify low wallet balance
exports.notifyLowBalance = async (userId, currentBalance, threshold = 1000) => {
  if (currentBalance <= threshold) {
    return await exports.createNotification(
      userId,
      'Low Wallet Balance',
      `Your wallet balance is low (₦${currentBalance.toLocaleString()}). Consider adding funds to participate in tournaments.`,
      'wallet_update',
      null,
      null
    );
  }
};

// ==================== SYSTEM NOTIFICATIONS ====================

// Send system-wide announcement
exports.sendSystemAnnouncement = async (title, message, userRole = null) => {
  try {
    const query = userRole ? { role: userRole } : {};
    const users = await User.find(query, '_id');
    const userIds = users.map(user => user._id);
    
    return await exports.createBulkNotifications(
      userIds,
      title,
      message,
      'system_message'
    );
  } catch (error) {
    console.error('Error sending system announcement:', error);
    return null;
  }
};

// ==================== NOTIFICATION MANAGEMENT ====================

// @desc    Get user notifications with pagination
// @route   GET /api/notifications
// @access  Private
exports.getUserNotifications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const startIndex = (page - 1) * limit;
  const filterRead = req.query.read === 'true' ? true : req.query.read === 'false' ? false : null;
  const filterType = req.query.type;
  
  let query = { user: req.user.id };
  
  // Filter by read/unread status if specified
  if (filterRead !== null) {
    query.isRead = filterRead;
  }
  
  // Filter by notification type if specified
  if (filterType) {
    query.type = filterType;
  }
  
  const total = await Notification.countDocuments(query);
  
  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(startIndex)
    .limit(limit)
    .populate('relatedId', 'title startDate status fullName amount reference');
  
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

// @desc    Get notification statistics
// @route   GET /api/notifications/stats
// @access  Private
exports.getNotificationStats = asyncHandler(async (req, res) => {
  const stats = await Notification.aggregate([
    { $match: { user: req.user.id } },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        unreadCount: {
          $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] }
        }
      }
    }
  ]);
  
  const totalUnread = await Notification.countDocuments({
    user: req.user.id,
    isRead: false
  });
  
  res.status(200).json({
    success: true,
    data: {
      totalUnread,
      byType: stats
    }
  });
});

// ==================== SCHEDULED NOTIFICATION HELPERS ====================

// Function to send tournament reminders (to be called by a cron job)
exports.sendScheduledTournamentReminders = async () => {
  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    // Find tournaments starting in the next hour
    const upcomingTournaments = await Tournament.find({
      startDate: {
        $gte: now,
        $lte: oneHourFromNow
      },
      status: 'upcoming'
    });
    
    const reminderPromises = upcomingTournaments.map(tournament => 
      exports.notifyTournamentReminder(tournament._id, 1)
    );
    
    await Promise.all(reminderPromises);
    console.log(`Sent reminders for ${upcomingTournaments.length} tournaments`);
  } catch (error) {
    console.error('Error sending scheduled tournament reminders:', error);
  }
};

// Function to clean up old notifications (to be called by a cron job)
exports.cleanupOldNotifications = async (daysOld = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await Notification.deleteMany({
      createdAt: { $lt: cutoffDate },
      isRead: true
    });
    
    console.log(`Cleaned up ${result.deletedCount} old notifications`);
    return result.deletedCount;
  } catch (error) {
    console.error('Error cleaning up old notifications:', error);
    return 0;
  }
};