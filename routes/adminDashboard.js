const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect, adminOnly, protectAdminRoute } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminDashboard');



// Admin user management routes
router.post('/create-admin', adminController.createAdmin);
router.put('/set-admin/:userId',adminOnly, adminController.setUserAsAdmin);
router.put('/remove-admin/:userId',adminOnly, adminController.removeAdminPrivileges);
router.get('/admins', protect, adminOnly, adminController.getAllAdmins);
router.post('/login', adminController.adminLogin);


// Admin dashboard
router.get('/dashboard',adminController.getDashboardStats);

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
router.get('/players', adminOnly,adminController.getAllPlayers);
router.get('/players/:userId',adminOnly, adminController.getPlayerDetails);
router.get('/players/:userId/download',adminOnly,  adminController.downloadPlayerData);
router.get('/players/:userId/profilepic',adminOnly,  adminController.downloadProfilePicture);
router.put('/players/:userId/status', adminOnly, adminController.updatePlayerStatus);
router.put('/players/:userId/ban',adminOnly,  adminController.banPlayer);
router.put('/players/:userId/unban',adminOnly,  adminController.unbanPlayer);

// /**
//  * VERIFICATION MANAGEMENT 
//  */


// Get all verification requests with pagination and filtering
router.get('/', adminOnly, adminController.getAllVerifications);

// Get single verification details
router.get('/:requestId', adminOnly, adminController.getVerificationDetails);

// Approve a verification request
router.put('/:requestId/approve', adminOnly, adminController.approveVerification);

// Reject a verification request
router.put('/:requestId/reject', adminOnly, adminController.rejectVerification);

// Download verification documents
router.get('/:requestId/download', adminOnly, adminController.downloadVerificationData);

// /**
//  * WITHDRAWAL MANAGEMENT
//  */

// // All routes will be protected with authentication and admin middleware
// // Base route: /api/admin/withdrawals

// // Get withdrawal statistics
router.get('/admin/withdrawals/stats', adminOnly, adminController.getWithdrawalStats);

// // Download withdrawal data - needs to be before the /:id route to avoid conflicts
router.get('/admin/withdrawals/download', adminOnly, adminController.downloadWithdrawals);

// // Get all withdrawals with pagination and filtering
router.get('/admin/withdrawals/', adminOnly, adminController.getAllWithdrawals);

// // Get withdrawal by ID
router.get('/admin/withdrawals/:id', adminOnly, adminController.getWithdrawalById);

// // Update withdrawal status
router.put('/admin/withdrawals/:id/status', adminOnly, adminController.updateWithdrawalStatus);


// /**
//  * TOURNAMENT MANAGEMENT
//  */

router.get('/download',adminOnly, adminController.downloadTournaments);

// // Get all tournaments with pagination
router.get('/',adminOnly, adminController.getAllTournaments);

// // Get tournament by ID
router.get('/:tournamentId',adminOnly, adminController.getTournamentById);

// // Update tournament status
router.put('/:tournamentId/status',adminOnly, adminController.updateTournamentStatus);

// // Delete tournament
router.delete('/:tournamentId',adminOnly, adminController.deleteTournament);

// /**
//  * ADMIN ACCOUNT SETTINGS
//  */
// // All routes are protected with both auth middleware and admin role check


// // Update admin profile
router.put('/profile',adminOnly,  adminController.updateProfile);

// // Update admin profile picture
router.put('/profile/picture', adminOnly, adminController.updateProfilePicture);

// // Change admin password
router.put('/profile/password', adminOnly, adminController.changePassword);

// /**
//  * ADMIN ANALYTICS & REPORTING
//  */
// // Get advanced analytics
router.get('/analytics', adminOnly, adminController.getAnalytics);

// // Get recent activity feed
router.get('/activity', adminOnly, adminController.getActivityFeed);

// // Generate monthly report
router.get('/reports/monthly', adminOnly,adminController.getMonthlyReport);

module.exports = router;