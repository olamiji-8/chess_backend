const express = require('express');
const router = express.Router();
const {
  // Notification Management Routes
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearReadNotifications,
  getNotificationStats,
  
  // Enhanced notification preferences
  updateNotificationPreferences,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestNotification,
  
  // Utility Functions for creating notifications
  createNotification,
  createBulkNotifications,
  
  // User Account Notifications
  notifyUserWelcome,
  
  // Verification Notifications
  notifyVerificationSubmitted,
  notifyVerificationApproved,
  notifyVerificationRejected,
  notifyAdminsNewVerification,
  
  // Tournament Notifications
  notifyTournamentCreated,
  notifyTournamentRegistration,
  notifyOrganizerNewRegistration,
  notifyTournamentStartingInFiveMinutes,
  notifyTournamentReminder,
  notifyTournamentStarted,
  notifyTournamentCompleted,
  notifyTournamentWinner,
  notifyTournamentCancelled,
  
  // Transaction Notifications
  notifyTransactionSuccess,
  notifyTransactionFailed,
  notifyTransactionPending,
  
  // Wallet Notifications
  notifyWalletUpdate,
  notifyLowBalance,
  
  // System Notifications
  sendSystemAnnouncement,
  
  // Scheduled Functions
  sendFiveMinuteTournamentReminders,
  sendScheduledTournamentReminders,
  cleanupOldNotifications,
  notifyWithdrawalSuccess
} = require('../controllers/notificationController');

// Import auth middleware
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ==================== USER NOTIFICATION ROUTES ====================

// Apply authentication middleware to all routes
router.use(protect);

// @route   GET /api/notifications
// @desc    Get user notifications with pagination and filtering
// @access  Private
router.get('/read', getUserNotifications);

// @route   GET /api/notifications/stats
// @desc    Get notification statistics
// @access  Private
router.get('/stats', getNotificationStats);

// @route   PUT /api/notifications/preferences
// @desc    Update notification preferences (email, push, types)
// @access  Private
router.put('/preferences', updateNotificationPreferences);

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



// ==================== PUSH NOTIFICATION ROUTES ====================

// @route   POST /api/notifications/subscribe-push
// @desc    Subscribe to push notifications
// @access  Private
router.post('/subscribe-push', subscribeToPush);

// @route   DELETE /api/notifications/unsubscribe-push
// @desc    Unsubscribe from push notifications
// @access  Private
router.delete('/unsubscribe-push', unsubscribeFromPush);


router.post('/withdrawal-success', adminOnly,notifyWithdrawalSuccess)

// ==================== ADMIN NOTIFICATION ROUTES ====================

// @route   POST /api/notifications/system-announcement
// @desc    Send system-wide announcement (Admin only)
// @access  Private/Admin
router.post('/system-announcement', adminOnly, async (req, res) => {
  try {
    const { title, message, userRole, sendEmail = true, sendPush = true } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required'
      });
    }
    
    const result = await sendSystemAnnouncement(title, message, userRole, { sendEmail, sendPush });
    
    if (result) {
      res.status(200).json({
        success: true,
        message: 'System announcement sent successfully',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send system announcement'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/notifications/manual-reminder/:tournamentId
// @desc    Manually send tournament reminder (Admin only)
// @access  Private/Admin
router.post('/manual-reminder/:tournamentId', adminOnly, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { hoursBeforeStart } = req.body;
    
    const result = await notifyTournamentReminder(tournamentId, hoursBeforeStart || 1);
    
    if (result) {
      res.status(200).json({
        success: true,
        message: 'Tournament reminder sent successfully',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send tournament reminder'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/notifications/manual-5min-reminder/:tournamentId
// @desc    Manually send 5-minute tournament reminder (Admin only)
// @access  Private/Admin


router.post('/manual-5min-reminder/:tournamentId', adminOnly, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    
    const result = await notifyTournamentStartingInFiveMinutes(tournamentId);
    
    if (result) {
      res.status(200).json({
        success: true,
        message: '5-minute tournament reminder sent successfully',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send 5-minute tournament reminder'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/notifications/tournament-winner
// @desc    Notify tournament winner (Admin only)
// @access  Private/Admin
router.post('/tournament-winner', adminOnly, async (req, res) => {
  try {
    const { userId, tournamentId, tournamentTitle, position, prizeAmount } = req.body;
    
    if (!userId || !tournamentId || !tournamentTitle) {
      return res.status(400).json({
        success: false,
        message: 'userId, tournamentId, and tournamentTitle are required'
      });
    }
    
    const result = await notifyTournamentWinner(userId, tournamentId, tournamentTitle, position || 1, prizeAmount);
    
    if (result) {
      res.status(200).json({
        success: true,
        message: 'Tournament winner notification sent successfully',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send tournament winner notification'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});


// ==================== WEBHOOK/EXTERNAL INTEGRATION ROUTES ====================

// @route   POST /api/notifications/webhook/payment
// @desc    Handle payment webhook notifications
// @access  Public (with webhook validation)
router.post('/webhook/payment', async (req, res) => {
  try {
    // Add webhook signature validation here if needed
    const { userId, transactionId, amount, status, type } = req.body;
    
    if (!userId || !transactionId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required webhook data'
      });
    }
    
    let result;
    if (status === 'success') {
      result = await notifyTransactionSuccess(userId, transactionId, amount, type);
    } else if (status === 'failed') {
      result = await notifyTransactionFailed(userId, transactionId, amount, type);
    } else if (status === 'pending') {
      result = await notifyTransactionPending(userId, transactionId, amount, type);
    }
    
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: result
    });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
});

// ==================== UTILITY ROUTES ====================

// @route   GET /api/notifications/vapid-key
// @desc    Get VAPID public key for frontend
// @access  Public
router.get('/vapid-key', (req, res) => {
  res.status(200).json({
    success: true,
    publicKey: process.env.VAPID_PUBLIC_KEY
  });
});

// @route   GET /api/notifications/health
// @desc    Health check for notification service
// @access  Private
router.get('/health', async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    
    // Check database connection
    const recentNotifications = await Notification.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    // Check email configuration
    const emailConfigured = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
    
    // Check push configuration
    const pushConfigured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    
    res.status(200).json({
      success: true,
      status: 'healthy',
      checks: {
        database: 'connected',
        email: emailConfigured ? 'configured' : 'not configured',
        push: pushConfigured ? 'configured' : 'not configured',
        recentNotifications
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;