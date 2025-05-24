// const express = require('express');
// const router = express.Router();
// const {
//   // Notification Management Routes
//   getUserNotifications,
//   markNotificationRead,
//   markAllNotificationsRead,
//   deleteNotification,
//   clearReadNotifications,
//   getNotificationStats,
  
//   // Utility Functions for creating notifications
//   createNotification,
//   createBulkNotifications,
  
//   // User Account Notifications
//   notifyUserWelcome,
  
//   // Verification Notifications
//   notifyVerificationSubmitted,
//   notifyVerificationApproved,
//   notifyVerificationRejected,
//   notifyAdminsNewVerification,
  
//   // Tournament Notifications
//   notifyTournamentCreated,
//   notifyTournamentRegistration,
//   notifyOrganizerNewRegistration,
//   notifyTournamentStartingInFiveMinutes,
//   notifyTournamentReminder,
//   notifyTournamentStarted,
//   notifyTournamentCompleted,
//   notifyTournamentWinner,
//   notifyTournamentCancelled,
  
//   // Transaction Notifications
//   notifyTransactionSuccess,
//   notifyTransactionFailed,
//   notifyTransactionPending,
  
//   // Wallet Notifications
//   notifyWalletUpdate,
//   notifyLowBalance,
  
//   // System Notifications
//   sendSystemAnnouncement,
  
//   // Scheduled Functions
//   sendFiveMinuteTournamentReminders,
//   sendScheduledTournamentReminders,
//   cleanupOldNotifications
// } = require('../controllers/notificationController');

// // Import auth middleware
// const { protect, admin } = require('../middleware/authMiddleware');

// // ==================== USER NOTIFICATION ROUTES ====================

// // Apply authentication middleware to all routes
// router.use(protect);

// // @route   GET /api/notifications
// // @desc    Get user notifications with pagination and filtering
// // @access  Private
// router.get('/', getUserNotifications);

// // @route   GET /api/notifications/stats
// // @desc    Get notification statistics
// // @access  Private
// router.get('/stats', getNotificationStats);

// // @route   PUT /api/notifications/read-all
// // @desc    Mark all notifications as read
// // @access  Private
// router.put('/read-all', markAllNotificationsRead);

// // @route   DELETE /api/notifications/clear-read
// // @desc    Delete all read notifications
// // @access  Private
// router.delete('/clear-read', clearReadNotifications);

// // @route   PUT /api/notifications/:id/read
// // @desc    Mark specific notification as read
// // @access  Private
// router.put('/:id/read', markNotificationRead);

// // @route   DELETE /api/notifications/:id
// // @desc    Delete a specific notification
// // @access  Private
// router.delete('/:id', deleteNotification);

// // ==================== ADMIN NOTIFICATION ROUTES ====================

// // @route   POST /api/notifications/system-announcement
// // @desc    Send system-wide announcement (Admin only)
// // @access  Private/Admin
// router.post('/system-announcement', admin, async (req, res) => {
//   try {
//     const { title, message, userRole } = req.body;
    
//     if (!title || !message) {
//       return res.status(400).json({
//         success: false,
//         message: 'Title and message are required'
//       });
//     }
    
//     const result = await sendSystemAnnouncement(title, message, userRole);
    
//     if (result) {
//       res.status(200).json({
//         success: true,
//         message: 'System announcement sent successfully',
//         data: result
//       });
//     } else {
//       res.status(500).json({
//         success: false,
//         message: 'Failed to send system announcement'
//       });
//     }
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// });

// // @route   POST /api/notifications/manual-reminder/:tournamentId
// // @desc    Manually send tournament reminder (Admin only)
// // @access  Private/Admin
// router.post('/manual-reminder/:tournamentId', admin, async (req, res) => {
//   try {
//     const { tournamentId } = req.params;
//     const { hoursBeforeStart } = req.body;
    
//     const result = await notifyTournamentReminder(tournamentId, hoursBeforeStart || 1);
    
//     if (result) {
//       res.status(200).json({
//         success: true,
//         message: 'Tournament reminder sent successfully',
//         data: result
//       });
//     } else {
//       res.status(500).json({
//         success: false,
//         message: 'Failed to send tournament reminder'
//       });
//     }
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// });

// // @route   POST /api/notifications/manual-5min-reminder/:tournamentId
// // @desc    Manually send 5-minute tournament reminder (Admin only)
// // @access  Private/Admin
// router.post('/manual-5min-reminder/:tournamentId', admin, async (req, res) => {
//   try {
//     const { tournamentId } = req.params;
    
//     const result = await notifyTournamentStartingInFiveMinutes(tournamentId);
    
//     if (result) {
//       res.status(200).json({
//         success: true,
//         message: '5-minute tournament reminder sent successfully',
//         data: result
//       });
//     } else {
//       res.status(500).json({
//         success: false,
//         message: 'Failed to send 5-minute tournament reminder'
//       });
//     }
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// });

// // @route   POST /api/notifications/tournament-winner
// // @desc    Notify tournament winner (Admin only)
// // @access  Private/Admin
// router.post('/tournament-winner', admin, async (req, res) => {
//   try {
//     const { userId, tournamentId, tournamentTitle, position, prizeAmount } = req.body;
    
//     if (!userId || !tournamentId || !tournamentTitle || !position) {
//       return res.status(400).json({
//         success: false,
//         message: 'userId, tournamentId, tournamentTitle, and position are required'
//       });
//     }
    
//     const result = await notifyTournamentWinner(userId, tournamentId, tournamentTitle, position, prizeAmount);
    
//     if (result) {
//       res.status(200).json({
//         success: true,
//         message: 'Winner notification sent successfully',
//         data: result
//       });
//     } else {
//       res.status(500).json({
//         success: false,
//         message: 'Failed to send winner notification'
//       });
//     }
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// });

// // @route   POST /api/notifications/cleanup-old
// // @desc    Clean up old notifications (Admin only)
// // @access  Private/Admin
// router.post('/cleanup-old', admin, async (req, res) => {
//   try {
//     const { daysOld } = req.body;
//     const deletedCount = await cleanupOldNotifications(daysOld || 30);
    
//     res.status(200).json({
//       success: true,
//       message: `Cleaned up ${deletedCount} old notifications`
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// });

// // ==================== WEBHOOK/INTERNAL ROUTES ====================

// // @route   POST /api/notifications/send-custom
// // @desc    Send custom notification (Internal use - can be called by other controllers)
// // @access  Private
// router.post('/send-custom', async (req, res) => {
//   try {
//     const { userId, title, message, type, relatedId, relatedModel } = req.body;
    
//     if (!userId || !title || !message || !type) {
//       return res.status(400).json({
//         success: false,
//         message: 'userId, title, message, and type are required'
//       });
//     }
    
//     const result = await createNotification(userId, title, message, type, relatedId, relatedModel);
    
//     if (result) {
//       res.status(200).json({
//         success: true,
//         message: 'Custom notification sent successfully',
//         data: result
//       });
//     } else {
//       res.status(500).json({
//         success: false,
//         message: 'Failed to send custom notification'
//       });
//     }
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// });

// // @route   POST /api/notifications/send-bulk
// // @desc    Send bulk notifications (Internal use)
// // @access  Private/Admin
// router.post('/send-bulk', admin, async (req, res) => {
//   try {
//     const { userIds, title, message, type, relatedId, relatedModel } = req.body;
    
//     if (!userIds || !Array.isArray(userIds) || !title || !message || !type) {
//       return res.status(400).json({
//         success: false,
//         message: 'userIds (array), title, message, and type are required'
//       });
//     }
    
//     const result = await createBulkNotifications(userIds, title, message, type, relatedId, relatedModel);
    
//     if (result) {
//       res.status(200).json({
//         success: true,
//         message: 'Bulk notifications sent successfully',
//         data: result
//       });
//     } else {
//       res.status(500).json({
//         success: false,
//         message: 'Failed to send bulk notifications'
//       });
//     }
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// });

