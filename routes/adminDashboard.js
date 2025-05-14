const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect, adminOnly, protectAdminRoute } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminDashboard');



// Admin user management routes
router.post('/create-admin', adminController.createAdmin);
router.put('/set-admin/:userId',protect, adminOnly, adminController.setUserAsAdmin);
router.put('/remove-admin/:userId',protect, adminOnly, adminController.removeAdminPrivileges);
router.get('/admins', protect, adminOnly, adminController.getAllAdmins);
router.post('/login', adminController.adminLogin);


// Admin dashboard
router.get('/dashboard',protect, adminOnly, adminController.getDashboardStats);

// // Stats route (from your existing code)
router.get('/stats',  async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();
    
    // Get verified users count
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    
    // Get unverified users count
    const unverifiedUsers = await User.countDocuments({ isVerified: false });
    
    // Get total tournaments count
    const totalTournaments = await Tournament.countDocuments();
    
    // Get active tournaments count
    const activeTournaments = await Tournament.countDocuments({ status: 'active' });
    
    // Get pending withdrawals count
    const pendingWithdrawals = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'pending' 
    });
    
    // Get completed withdrawals count
    const completedWithdrawals = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'completed' 
    });
    
    // Get declined withdrawals count
    const declinedWithdrawals = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'failed' 
    });
    
    // Get pending verifications count
    const pendingVerifications = await VerificationRequest.countDocuments({
      status: 'pending'
    });
    
    // Get approved verifications count
    const approvedVerifications = await VerificationRequest.countDocuments({
      status: 'approved'
    });
    
    // Get rejected verifications count
    const rejectedVerifications = await VerificationRequest.countDocuments({
      status: 'rejected'
    });
    
    // Get total transactions amount
    const transactionsStats = await Transaction.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          amount: { $sum: '$amount' }
        }
      }
    ]);
    
    // Process transaction stats
    const transactionsByType = {};
    let totalTransactionAmount = 0;
    
    transactionsStats.forEach(stat => {
      transactionsByType[stat._id] = {
        count: stat.count,
        amount: stat.amount
      };
      totalTransactionAmount += stat.amount;
    });

    // Get total organizers (users who have created tournaments)
    const totalOrganizers = await User.countDocuments({
      createdTournaments: { $exists: true, $ne: [] }
    });

    // Get recent activity (last 10 transactions)
    const recentActivity = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'fullName email lichessUsername')
      .populate('tournament', 'title')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          verified: verifiedUsers,
          unverified: unverifiedUsers
        },
        tournaments: {
          total: totalTournaments,
          active: activeTournaments
        },
        withdrawals: {
          pending: pendingWithdrawals,
          completed: completedWithdrawals,
          declined: declinedWithdrawals,
          total: pendingWithdrawals + completedWithdrawals + declinedWithdrawals
        },
        verifications: {
          pending: pendingVerifications,
          approved: approvedVerifications,
          rejected: rejectedVerifications,
          total: pendingVerifications + approvedVerifications + rejectedVerifications
        },
        transactions: {
          byType: transactionsByType,
          totalAmount: totalTransactionAmount
        },
        organizers: {
          total: totalOrganizers
        },
        recentActivity: recentActivity
      }
    });
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting admin stats',
      error: error.message
    });
  }
});


// Player management routes
router.get('/players', protect, adminOnly,adminController.getAllPlayers);
router.get('/players/:userId',protect, adminOnly, adminController.getPlayerDetails);
router.get('/players/:userId/download',protect, adminOnly,  adminController.downloadPlayerData);
router.get('/players/:userId/profilepic',protect, adminOnly,  adminController.downloadProfilePicture);
router.put('/players/:userId/status', protect, adminOnly, adminController.updatePlayerStatus);
router.put('/players/:userId/ban',protect, adminOnly,  adminController.banPlayer);
router.put('/players/:userId/unban',protect, adminOnly,  adminController.unbanPlayer);

// /**
//  * VERIFICATION MANAGEMENT 
//  */


// Get all verification requests with pagination and filtering
router.get('/', protect, adminOnly, adminController.getAllVerifications);

// Get single verification details
router.get('/:requestId', protect, adminOnly, adminController.getVerificationDetails);

// Approve a verification request
router.put('/:requestId/approve', protect, adminOnly, adminController.approveVerification);

// Reject a verification request
router.put('/:requestId/reject', protect, adminOnly, adminController.rejectVerification);

// Download verification documents
router.get('/:requestId/download', protect, adminOnly, adminController.downloadVerificationData);

// /**
//  * WITHDRAWAL MANAGEMENT
//  */

// // All routes will be protected with authentication and admin middleware
// // Base route: /api/admin/withdrawals

// // Get withdrawal statistics
router.get('/admin/withdrawals/stats', protect, adminOnly, adminController.getWithdrawalStats);

// // Download withdrawal data - needs to be before the /:id route to avoid conflicts
router.get('/admin/withdrawals/download', protect, adminOnly, adminController.downloadWithdrawals);

// // Get all withdrawals with pagination and filtering
router.get('/admin/withdrawals/', protect, adminOnly, adminController.getAllWithdrawals);

// // Get withdrawal by ID
router.get('/admin/withdrawals/:id', protect, adminOnly, adminController.getWithdrawalById);

// // Update withdrawal status
router.put('/admin/withdrawals/:id/status', protect, adminOnly, adminController.updateWithdrawalStatus);


// /**
//  * TOURNAMENT MANAGEMENT
//  */

router.get('/download',protect, adminOnly, adminController.downloadTournaments);

// // Get all tournaments with pagination
router.get('/',protect, adminOnly, adminController.getAllTournaments);

// // Get tournament by ID
router.get('/:tournamentId',protect, adminOnly, adminController.getTournamentById);

// // Update tournament status
router.put('/:tournamentId/status',protect, adminOnly, adminController.updateTournamentStatus);

// // Delete tournament
router.delete('/:tournamentId',protect, adminOnly, adminController.deleteTournament);

// /**
//  * ADMIN ACCOUNT SETTINGS
//  */
// // All routes are protected with both auth middleware and admin role check


// // Update admin profile
router.put('/profile',protect, adminOnly,  adminController.updateProfile);

// // Update admin profile picture
router.put('/profile/picture', protect, adminOnly, adminController.updateProfilePicture);

// // Change admin password
router.put('/profile/password', protect, adminOnly, adminController.changePassword);

// /**
//  * ADMIN ANALYTICS & REPORTING
//  */
// // Get advanced analytics
router.get('/analytics', protect, adminOnly, adminController.getAnalytics);

// // Get recent activity feed
router.get('/activity', protect, adminOnly, adminController.getActivityFeed);

// // Generate monthly report
router.get('/reports/monthly', protect, adminOnly,adminController.getMonthlyReport);

module.exports = router;