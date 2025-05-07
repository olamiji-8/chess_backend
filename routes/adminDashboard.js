const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Transaction = require('../models/Transaction');
const VerificationRequest = require('../models/verification');
const { admin } = require('../middleware/authMiddleware');

/**
 * DASHBOARD STATISTICS
 */

// Get admin dashboard statistics
router.get('/stats', async (req, res) => {
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

/**
 * PLAYER MANAGEMENT
 */

// Get all players with stats and pagination
router.get('/players', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status; // 'verified', 'unverified', 'declined'
    const search = req.query.search || '';

    // Build match criteria
    const matchCriteria = { role: 'user' };
    
    if (status === 'verified') {
      matchCriteria.isVerified = true;
    } else if (status === 'unverified') {
      matchCriteria.isVerified = false;
    } else if (status === 'declined') {
      // For declined, we need to check verification requests
      // This is a placeholder, you might need to adjust based on your schema
      const declinedUserIds = await VerificationRequest.find({ status: 'rejected' })
        .distinct('user');
      matchCriteria._id = { $in: declinedUserIds };
    }
    
    // Add search functionality
    if (search) {
      matchCriteria.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { lichessUsername: { $regex: search, $options: 'i' } }
      ];
    }

    // Count total documents for pagination
    const totalDocs = await User.countDocuments(matchCriteria);

    // Get players with pagination
    const players = await User.aggregate([
      {
        $match: matchCriteria
      },
      {
        $project: {
          fullName: 1,
          email: 1,
          profilePic: 1,
          lichessUsername: 1,
          isVerified: 1,
          createdAt: 1,
          registeredTournamentsCount: { $size: { $ifNull: ['$registeredTournaments', []] } },
          createdTournamentsCount: { $size: { $ifNull: ['$createdTournaments', []] } },
          walletBalance: 1,
          phoneNumber: 1
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      }
    ]);

    // Get counts for each status
    const verifiedCount = await User.countDocuments({ role: 'user', isVerified: true });
    const unverifiedCount = await User.countDocuments({ role: 'user', isVerified: false });
    const declinedCount = await VerificationRequest.countDocuments({ status: 'rejected' });

    res.status(200).json({
      success: true,
      pagination: {
        total: totalDocs,
        page,
        limit,
        pages: Math.ceil(totalDocs / limit)
      },
      counts: {
        verified: verifiedCount,
        unverified: unverifiedCount,
        declined: declinedCount,
        total: totalDocs
      },
      data: players
    });
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching players',
      error: error.message
    });
  }
});

// Get single player detailed stats
router.get('/players/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get created tournaments
    const createdTournaments = await Tournament.find({
      organizer: userId
    }).select('title startDate status participants category').lean();

    // Get registered tournaments
    const registeredTournaments = await Tournament.find({
      participants: userId
    }).select('title startDate status category').lean();

    // Get transaction history
    const transactions = await Transaction.find({
      user: userId
    }).sort({ createdAt: -1 }).lean();

    // Get verification status history
    const verificationHistory = await VerificationRequest.find({
      user: userId
    }).sort({ updatedAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          profilePic: user.profilePic,
          lichessUsername: user.lichessUsername,
          phoneNumber: user.phoneNumber,
          isVerified: user.isVerified,
          walletBalance: user.walletBalance,
          createdAt: user.createdAt,
          bankDetails: user.bankDetails || {}
        },
        stats: {
          createdTournaments: createdTournaments,
          registeredTournaments: registeredTournaments,
          totalCreated: createdTournaments.length,
          totalRegistered: registeredTournaments.length
        },
        transactions: transactions,
        verificationHistory: verificationHistory
      }
    });
  } catch (error) {
    console.error('Error fetching player details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching player details',
      error: error.message
    });
  }
});

// Download player data
router.get('/players/:userId/download', async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get all user-related data
    const createdTournaments = await Tournament.find({
      organizer: userId
    }).select('title startDate status participants category').lean();

    const registeredTournaments = await Tournament.find({
      participants: userId
    }).select('title startDate status category').lean();

    const transactions = await Transaction.find({
      user: userId
    }).sort({ createdAt: -1 }).lean();

    const verificationHistory = await VerificationRequest.find({
      user: userId
    }).sort({ updatedAt: -1 }).lean();

    // Create data object for download
    const userData = {
      personalInfo: {
        fullName: user.fullName,
        email: user.email,
        lichessUsername: user.lichessUsername,
        phoneNumber: user.phoneNumber,
        isVerified: user.isVerified,
        walletBalance: user.walletBalance,
        createdAt: user.createdAt,
        bankDetails: user.bankDetails || {}
      },
      tournaments: {
        created: createdTournaments,
        registered: registeredTournaments
      },
      transactions: transactions,
      verificationHistory: verificationHistory
    };

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=user_${userId}_data.json`);
    
    // Send the data as a downloadable file
    res.status(200).json(userData);
  } catch (error) {
    console.error('Error downloading player data:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading player data',
      error: error.message
    });
  }
});

// Download profile picture
router.get('/players/:userId/profilepic', async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId).select('profilePic').lean();

    if (!user || !user.profilePic) {
      return res.status(404).json({
        success: false,
        message: 'User or profile picture not found'
      });
    }

    // This is a redirect to the actual image URL
    // For security, you might want to download the image and serve it directly
    res.redirect(user.profilePic);
  } catch (error) {
    console.error('Error fetching profile picture:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile picture',
      error: error.message
    });
  }
});

// Change user verification status
router.put('/players/:userId/status', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { status, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    if (!status || !['verified', 'unverified', 'declined'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: verified, unverified, declined'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user verification status
    if (status === 'verified') {
      user.isVerified = true;
      await user.save();
      
      // Update any pending verification requests
      await VerificationRequest.updateMany(
        { user: userId, status: 'pending' },
        { status: 'approved', updatedAt: Date.now() }
      );
    } else if (status === 'unverified') {
      user.isVerified = false;
      await user.save();
    } else if (status === 'declined') {
      user.isVerified = false;
      await user.save();
      
      // Update any pending verification requests
      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Reason is required for declining verification'
        });
      }
      
      await VerificationRequest.updateMany(
        { user: userId, status: 'pending' },
        { 
          status: 'rejected', 
          rejectionReason: reason,
          updatedAt: Date.now() 
        }
      );
    }

    res.status(200).json({
      success: true,
      message: `User status updated to ${status}`,
      data: {
        userId: user._id,
        isVerified: user.isVerified,
        status
      }
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user status',
      error: error.message
    });
  }
});

// Ban a player (disable account)
router.put('/players/:userId/ban', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Ban reason is required'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add a new field to track banned status
    user.isBanned = true;
    user.banReason = reason;
    user.bannedAt = Date.now();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User has been banned',
      data: {
        userId: user._id,
        isBanned: user.isBanned,
        banReason: user.banReason,
        bannedAt: user.bannedAt
      }
    });
  } catch (error) {
    console.error('Error banning user:', error);
    res.status(500).json({
      success: false,
      message: 'Error banning user',
      error: error.message
    });
  }
});

// Unban a player
router.put('/players/:userId/unban', async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isBanned = false;
    user.banReason = undefined;
    user.bannedAt = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User has been unbanned',
      data: {
        userId: user._id,
        isBanned: user.isBanned
      }
    });
  } catch (error) {
    console.error('Error unbanning user:', error);
    res.status(500).json({
      success: false,
      message: 'Error unbanning user',
      error: error.message
    });
  }
});

/**
 * VERIFICATION MANAGEMENT
 */

// Get all verification requests with pagination
router.get('/verifications', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status || 'pending'; // Default to pending
    const search = req.query.search || '';

    // Build query
    const query = { status };
    
    // Add search functionality
    if (search) {
      // We need to join with User model to search by username or email
      const users = await User.find({
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { lichessUsername: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      const userIds = users.map(user => user._id);
      query.user = { $in: userIds };
    }

    // Count total documents for pagination
    const totalDocs = await VerificationRequest.countDocuments(query);

    // Get verification requests with pagination
    const verifications = await VerificationRequest.find(query)
      .populate('user', 'fullName email lichessUsername profilePic')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get counts for each status
    const pendingCount = await VerificationRequest.countDocuments({ status: 'pending' });
    const approvedCount = await VerificationRequest.countDocuments({ status: 'approved' });
    const rejectedCount = await VerificationRequest.countDocuments({ status: 'rejected' });

    res.status(200).json({
      success: true,
      pagination: {
        total: totalDocs,
        page,
        limit,
        pages: Math.ceil(totalDocs / limit)
      },
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: pendingCount + approvedCount + rejectedCount
      },
      data: verifications
    });
  } catch (error) {
    console.error('Error fetching verification requests:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching verification requests',
      error: error.message
    });
  }
});

// Approve a verification request
router.put('/verifications/:requestId/approve', async (req, res) => {
  try {
    const requestId = req.params.requestId;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }

    const verificationRequest = await VerificationRequest.findById(requestId);

    if (!verificationRequest) {
      return res.status(404).json({
        success: false,
        message: 'Verification request not found'
      });
    }

    // Update verification request status
    verificationRequest.status = 'approved';
    verificationRequest.updatedAt = Date.now();
    await verificationRequest.save();

    // Update user's verification status
    const user = await User.findById(verificationRequest.user);
    if (user) {
      user.isVerified = true;
      await user.save();

      // Here you would typically send a notification
      // Placeholder for notification logic
      console.log(`User ${user._id} has been verified!`);
    }

    res.status(200).json({
      success: true,
      message: 'Verification request approved',
      data: verificationRequest
    });
  } catch (error) {
    console.error('Error approving verification:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving verification',
      error: error.message
    });
  }
});

// Reject a verification request
router.put('/verifications/:requestId/reject', async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const requestId = req.params.requestId;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const verificationRequest = await VerificationRequest.findById(requestId);

    if (!verificationRequest) {
      return res.status(404).json({
        success: false,
        message: 'Verification request not found'
      });
    }

    // Update verification request
    verificationRequest.status = 'rejected';
    verificationRequest.rejectionReason = rejectionReason;
    verificationRequest.updatedAt = Date.now();
    await verificationRequest.save();

    res.status(200).json({
      success: true,
      message: 'Verification request rejected',
      data: verificationRequest
    });
  } catch (error) {
    console.error('Error rejecting verification:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting verification',
      error: error.message
    });
  }
});

// Download verification documents
router.get('/verifications/:requestId/download', async (req, res) => {
  try {
    const requestId = req.params.requestId;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }

    const verificationRequest = await VerificationRequest.findById(requestId)
      .populate('user', 'fullName email lichessUsername')
      .lean();

    if (!verificationRequest) {
      return res.status(404).json({
        success: false,
        message: 'Verification request not found'
      });
    }

    // Create data object for download
    const verificationData = {
      requestId: verificationRequest._id,
      user: verificationRequest.user,
      fullName: verificationRequest.fullName,
      address: verificationRequest.address,
      idType: verificationRequest.idType,
      idNumber: verificationRequest.idNumber,
      status: verificationRequest.status,
      createdAt: verificationRequest.createdAt,
      updatedAt: verificationRequest.updatedAt,
      idCardImageUrl: verificationRequest.idCardImage,
      selfieImageUrl: verificationRequest.selfieImage
    };

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=verification_${requestId}_data.json`);
    
    // Send the data as a downloadable file
    res.status(200).json(verificationData);
  } catch (error) {
    console.error('Error downloading verification data:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading verification data',
      error: error.message
    });
  }
});

/**
 * WITHDRAWAL MANAGEMENT
 */

/// Get all withdrawal requests with pagination and filtering
router.get('/withdrawals', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status || 'all'; // 'all', 'pending', 'completed', 'failed'
    const search = req.query.search || '';

    // Build query
    const query = { type: 'withdrawal' };
    
    if (status !== 'all') {
      query.status = status;
    }
    
    // Add search functionality
    if (search) {
      // Join with User model to search by username or email
      const users = await User.find({
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { lichessUsername: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      const userIds = users.map(user => user._id);
      query.user = { $in: userIds };
    }

    // Count total documents for pagination
    const totalDocs = await Transaction.countDocuments(query);

    // Get withdrawal requests with pagination
    const withdrawals = await Transaction.find(query)
      .populate('user', 'fullName email lichessUsername walletBalance')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get counts for each status
    const pendingCount = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'pending' 
    });
    
    const completedCount = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'completed' 
    });
    
    const failedCount = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'failed' 
    });

    res.status(200).json({
      success: true,
      pagination: {
        total: totalDocs,
        page,
        limit,
        pages: Math.ceil(totalDocs / limit)
      },
      counts: {
        pending: pendingCount,
        completed: completedCount,
        failed: failedCount,
        total: totalDocs
      },
      data: withdrawals
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching withdrawals',
      error: error.message
    });
  }
});

// Get withdrawal by ID
router.get('/withdrawals/:id', async (req, res) => {
  try {
    const withdrawal = await Transaction.findOne({
      _id: req.params.id,
      type: 'withdrawal'
    }).populate('user', 'fullName email lichessUsername walletBalance');

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    res.status(200).json({
      success: true,
      data: withdrawal
    });
  } catch (error) {
    console.error('Error fetching withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching withdrawal',
      error: error.message
    });
  }
});

// Update withdrawal status
router.put('/withdrawals/:id/status', async (req, res) => {
  try {
    const { status, reason } = req.body;
    
    if (!['pending', 'completed', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const withdrawal = await Transaction.findOne({
      _id: req.params.id,
      type: 'withdrawal'
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    // If transitioning from pending to failed, we should refund the user's wallet
    if (withdrawal.status === 'pending' && status === 'failed') {
      const user = await User.findById(withdrawal.user);
      if (user) {
        user.walletBalance += withdrawal.amount;
        await user.save();
      }
    }

    // Update the withdrawal status
    withdrawal.status = status;
    if (reason) {
      withdrawal.details = {
        ...withdrawal.details,
        statusReason: reason
      };
    }
    
    await withdrawal.save();

    res.status(200).json({
      success: true,
      message: `Withdrawal ${status} successfully`,
      data: withdrawal
    });
  } catch (error) {
    console.error('Error updating withdrawal status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating withdrawal status',
      error: error.message
    });
  }
});

// Download withdrawal data
router.get('/withdrawals/download', async (req, res) => {
  try {
    const status = req.query.status || 'all';
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    
    // Build query
    const query = { type: 'withdrawal' };
    
    if (status !== 'all') {
      query.status = status;
    }
    
    // Add date range if provided
    if (startDate && endDate) {
      query.createdAt = {
        $gte: startDate,
        $lte: endDate
      };
    } else if (startDate) {
      query.createdAt = { $gte: startDate };
    } else if (endDate) {
      query.createdAt = { $lte: endDate };
    }

    // Get withdrawal data
    const withdrawals = await Transaction.find(query)
      .populate('user', 'fullName email lichessUsername walletBalance')
      .sort({ createdAt: -1 })
      .lean();

    // Format data for export
    const formattedWithdrawals = withdrawals.map(w => ({
      reference: w.reference,
      username: w.user ? w.user.fullName : 'N/A',
      email: w.user ? w.user.email : 'N/A',
      lichessUsername: w.user ? w.user.lichessUsername : 'N/A',
      amount: w.amount,
      status: w.status,
      paymentMethod: w.paymentMethod,
      walletBalance: w.user ? w.user.walletBalance : 0,
      createdAt: w.createdAt,
      lastUpdated: w.lastUpdated,
      bankDetails: w.details && w.details.bankDetails ? {
        accountNumber: w.details.bankDetails.accountNumber,
        accountName: w.details.bankDetails.accountName,
        bankName: w.details.bankDetails.bankName
      } : 'N/A'
    }));

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=withdrawals_${status}_${Date.now()}.json`);
    
    // Send the data as a downloadable file
    res.status(200).json(formattedWithdrawals);
  } catch (error) {
    console.error('Error downloading withdrawals:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading withdrawals',
      error: error.message
    });
  }
});

// Get withdrawal dashboard statistics
router.get('/withdrawals/stats', async (req, res) => {
  try {
    // Get counts for each status
    const pendingCount = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'pending' 
    });
    
    const completedCount = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'completed' 
    });
    
    const failedCount = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'failed' 
    });

    // Get total amount for each status
    const pendingAmount = await Transaction.aggregate([
      { $match: { type: 'withdrawal', status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const completedAmount = await Transaction.aggregate([
      { $match: { type: 'withdrawal', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Get recent withdrawals
    const recentWithdrawals = await Transaction.find({ type: 'withdrawal' })
      .populate('user', 'fullName email lichessUsername')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      stats: {
        counts: {
          pending: pendingCount,
          completed: completedCount,
          failed: failedCount,
          total: pendingCount + completedCount + failedCount
        },
        amounts: {
          pending: pendingAmount.length > 0 ? pendingAmount[0].total : 0,
          completed: completedAmount.length > 0 ? completedAmount[0].total : 0
        }
      },
      recentWithdrawals
    });
  } catch (error) {
    console.error('Error fetching withdrawal stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching withdrawal statistics',
      error: error.message
    });
  }
});

      /**
 * TOURNAMENT MANAGEMENT
 */

// Get all tournaments with pagination
router.get('/tournaments', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status || 'all'; // 'all', 'upcoming', 'active', 'completed', 'cancelled'
    const search = req.query.search || '';

    // Build query
    const query = {};
    
    if (status !== 'all') {
      query.status = status;
    }
    
    // Add search functionality
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    // Count total documents for pagination
    const totalDocs = await Tournament.countDocuments(query);

    // Get tournaments with pagination
    const tournaments = await Tournament.find(query)
      .populate('organizer', 'fullName email lichessUsername')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get counts for each status
    const upcomingCount = await Tournament.countDocuments({ status: 'upcoming' });
    const activeCount = await Tournament.countDocuments({ status: 'active' });
    const completedCount = await Tournament.countDocuments({ status: 'completed' });
    const cancelledCount = await Tournament.countDocuments({ status: 'cancelled' });

    res.status(200).json({
      success: true,
      pagination: {
        total: totalDocs,
        page,
        limit,
        pages: Math.ceil(totalDocs / limit)
      },
      counts: {
        upcoming: upcomingCount,
        active: activeCount,
        completed: completedCount,
        cancelled: cancelledCount,
        total: totalDocs
      },
      data: tournaments
    });
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tournaments',
      error: error.message
    });
  }
});

// Get tournament details
router.get('/tournaments/:tournamentId', async (req, res) => {
  try {
    const tournamentId = req.params.tournamentId;

    if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tournament ID'
      });
    }

    const tournament = await Tournament.findById(tournamentId)
      .populate('organizer', 'fullName email lichessUsername profilePic')
      .populate('participants', 'fullName lichessUsername profilePic');

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Get related transactions
    const transactions = await Transaction.find({
      tournament: tournamentId
    }).populate('user', 'fullName email lichessUsername').lean();

    res.status(200).json({
      success: true,
      data: {
        tournament,
        transactions
      }
    });
  } catch (error) {
    console.error('Error fetching tournament details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tournament details',
      error: error.message
    });
  }
});

// Delete tournament
router.delete('/tournaments/:tournamentId', async (req, res) => {
  try {
    const tournamentId = req.params.tournamentId;

    if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tournament ID'
      });
    }

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if tournament has participants
    if (tournament.participants && tournament.participants.length > 0) {
      // If there are participants, we need to refund their entry fees
      // Create refund transactions for each participant
      for (const participantId of tournament.participants) {
        const user = await User.findById(participantId);
        
        if (user) {
          // Create refund transaction
          await Transaction.create({
            user: participantId,
            tournament: tournamentId,
            type: 'refund',
            amount: tournament.entryFee,
            reference: `REFUND-${Date.now()}-${participantId.toString().substring(0, 6)}`,
            paymentMethod: 'wallet',
            status: 'completed',
            details: {
              reason: 'Tournament deleted by admin',
              tournamentTitle: tournament.title
            }
          });
          
          // Update user wallet balance
          user.walletBalance += tournament.entryFee;
          await user.save();
          
          // Remove tournament from user's registered tournaments
          await User.findByIdAndUpdate(participantId, {
            $pull: { registeredTournaments: tournamentId }
          });
        }
      }
    }

    // Remove tournament from organizer's created tournaments
    await User.findByIdAndUpdate(tournament.organizer, {
      $pull: { createdTournaments: tournamentId }
    });

    // Delete tournament
    await Tournament.findByIdAndDelete(tournamentId);

    res.status(200).json({
      success: true,
      message: 'Tournament deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting tournament:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting tournament',
      error: error.message
    });
  }
});

// Update tournament status
router.put('/tournaments/:tournamentId/status', async (req, res) => {
  try {
    const tournamentId = req.params.tournamentId;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tournament ID'
      });
    }

    if (!status || !['upcoming', 'active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: upcoming, active, completed, cancelled'
      });
    }

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Handle special case for cancelled status
    if (status === 'cancelled' && tournament.status !== 'cancelled') {
      // Refund entry fees to participants
      for (const participantId of tournament.participants) {
        const user = await User.findById(participantId);
        
        if (user) {
          // Create refund transaction
          await Transaction.create({
            user: participantId,
            tournament: tournamentId,
            type: 'refund',
            amount: tournament.entryFee,
            reference: `REFUND-${Date.now()}-${participantId.toString().substring(0, 6)}`,
            paymentMethod: 'wallet',
            status: 'completed',
            details: {
              reason: 'Tournament cancelled by admin',
              tournamentTitle: tournament.title
            }
          });
          
          // Update user wallet balance
          user.walletBalance += tournament.entryFee;
          await user.save();
        }
      }
    }

    // Update tournament status
    tournament.status = status;
    await tournament.save();

    res.status(200).json({
      success: true,
      message: `Tournament status updated to ${status}`,
      data: {
        tournamentId: tournament._id,
        title: tournament.title,
        status: tournament.status
      }
    });
  } catch (error) {
    console.error('Error updating tournament status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating tournament status',
      error: error.message
    });
  }
});

// Download tournament data
router.get('/tournaments/download', async (req, res) => {
  try {
    const status = req.query.status || 'all';
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    
    // Build query
    const query = {};
    
    if (status !== 'all') {
      query.status = status;
    }
    
    // Add date range if provided
    if (startDate && endDate) {
      query.startDate = {
        $gte: startDate,
        $lte: endDate
      };
    } else if (startDate) {
      query.startDate = { $gte: startDate };
    } else if (endDate) {
      query.startDate = { $lte: endDate };
    }

    // Get tournament data
    const tournaments = await Tournament.find(query)
      .populate('organizer', 'fullName email lichessUsername')
      .sort({ startDate: -1 })
      .lean();

    // Format data for export
    const formattedTournaments = tournaments.map(t => ({
      title: t.title,
      category: t.category,
      organizer: t.organizer ? {
        fullName: t.organizer.fullName,
        email: t.organizer.email,
        lichessUsername: t.organizer.lichessUsername
      } : 'N/A',
      startDate: t.startDate,
      startTime: t.startTime,
      duration: t.duration,
      status: t.status,
      entryFee: t.entryFee,
      participantsCount: t.participants ? t.participants.length : 0,
      prizeType: t.prizeType,
      tournamentLink: t.tournamentLink,
      createdAt: t.createdAt
    }));

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=tournaments_${status}_${Date.now()}.json`);
    
    // Send the data as a downloadable file
    res.status(200).json({
      totalRecords: formattedTournaments.length,
      data: formattedTournaments
    });
  } catch (error) {
    console.error('Error downloading tournament data:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading tournament data',
      error: error.message
    });
  }
});

/**
 * ADMIN ACCOUNT SETTINGS
 */

// Update admin profile
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { fullName, email } = req.body;

    // Validation
    if (!fullName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both fullName and email'
      });
    }

    // Check if email already exists (except for the current user)
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { fullName, email },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
});

// Update admin profile picture
router.put('/profile/picture', async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { profilePic } = req.body;

    if (!profilePic) {
      return res.status(400).json({
        success: false,
        message: 'Profile picture URL is required'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Error updating profile picture:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile picture',
      error: error.message
    });
  }
});

// Change admin password
router.put('/profile/password', async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both current and new password'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    // Get user with password
    const user = await User.findById(userId).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if current password matches
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing password',
      error: error.message
    });
  }
});

/**
 * ADMIN ANALYTICS & REPORTING
 */

// Get advanced analytics
router.get('/analytics', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || 'month'; // 'week', 'month', 'year', 'all'
    
    // Calculate date range based on timeframe
    const endDate = new Date();
    let startDate = new Date();
    
    if (timeframe === 'week') {
      startDate.setDate(endDate.getDate() - 7);
    } else if (timeframe === 'month') {
      startDate.setMonth(endDate.getMonth() - 1);
    } else if (timeframe === 'year') {
      startDate.setFullYear(endDate.getFullYear() - 1);
    } else if (timeframe === 'all') {
      startDate = new Date(0); // Beginning of time
    }

    // User growth analytics
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Tournament analytics
    const tournamentAnalytics = await Tournament.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 },
          entryFeeTotal: { $sum: '$entryFee' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Transaction analytics
    const transactionAnalytics = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type'
          },
          count: { $sum: 1 },
          amount: { $sum: '$amount' }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    // Category distribution of tournaments
    const categoryDistribution = await Tournament.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    // User verification rate
    const totalUsers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });
    
    const verifiedUsers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      isVerified: true
    });

    const verificationRate = totalUsers > 0 ? (verifiedUsers / totalUsers) * 100 : 0;

    res.status(200).json({
      success: true,
      data: {
        userGrowth,
        tournamentAnalytics,
        transactionAnalytics,
        categoryDistribution,
        verificationStats: {
          total: totalUsers,
          verified: verifiedUsers,
          rate: verificationRate.toFixed(2)
        },
        timeframe
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics',
      error: error.message
    });
  }
});

// Get recent activity feed
router.get('/activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    // Get recent transactions
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'fullName email lichessUsername')
      .populate('tournament', 'title')
      .lean();
    
    // Get recent tournament creations
    const tournaments = await Tournament.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('organizer', 'fullName email lichessUsername')
      .lean()
      .then(tournaments => tournaments.map(t => ({
        ...t,
        activityType: 'tournament_created',
        createdAt: t.createdAt
      })));
    
    // Get recent user registrations
    const users = await User.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('fullName email lichessUsername createdAt')
      .lean()
      .then(users => users.map(u => ({
        ...u,
        activityType: 'user_registered',
        createdAt: u.createdAt
      })));
    
    // Get recent verification requests
    const verifications = await VerificationRequest.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'fullName email lichessUsername')
      .lean()
      .then(verifications => verifications.map(v => ({
        ...v,
        activityType: 'verification_request',
        createdAt: v.createdAt
      })));
    
    // Combine all activities and sort by date
    const allActivities = [
      ...transactions.map(t => ({
        ...t,
        activityType: `transaction_${t.type}`,
        timestamp: t.createdAt
      })),
      ...tournaments.map(t => ({
        ...t,
        activityType: 'tournament_created',
        timestamp: t.createdAt
      })),
      ...users.map(u => ({
        ...u,
        activityType: 'user_registered',
        timestamp: u.createdAt
      })),
      ...verifications.map(v => ({
        ...v,
        activityType: `verification_${v.status}`,
        timestamp: v.createdAt
      }))
    ];
    
    // Sort by timestamp descending and limit results
    const sortedActivities = allActivities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    res.status(200).json({
      success: true,
      data: sortedActivities
    });
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activity feed',
      error: error.message
    });
  }
});

// Generate monthly report
router.get('/reports/monthly', async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1; // 1-12
    const year = parseInt(req.query.year) || new Date().getFullYear();
    
    // Create date range for the requested month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59); // Last day of month
    
    // User statistics
    const newUsers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });
    
    const verifiedUsers = await User.countDocuments({
      isVerified: true,
      createdAt: { $gte: startDate, $lte: endDate }
    });
    
    // Tournament statistics
    const newTournaments = await Tournament.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });
    
    const completedTournaments = await Tournament.countDocuments({
      status: 'completed',
      startDate: { $gte: startDate, $lte: endDate }
    });
    
    // Transaction statistics
    const transactionStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);
    
    // Format transaction stats
    const formattedTransactions = {};
    let totalRevenue = 0;
    
    transactionStats.forEach(stat => {
      formattedTransactions[stat._id] = {
        count: stat.count,
        totalAmount: stat.totalAmount
      };
      
      // Calculate revenue
      if (['deposit', 'tournament_entry', 'tournament_funding'].includes(stat._id)) {
        totalRevenue += stat.totalAmount;
      }
      
      if (['withdrawal', 'prize_payout', 'refund'].includes(stat._id)) {
        totalRevenue -= stat.totalAmount;
      }
    });
    
    // Category-wise tournament distribution
    const categoryDistribution = await Tournament.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Daily statistics for charts
    const dailyStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type'
          },
          count: { $sum: 1 },
          amount: { $sum: '$amount' }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period: {
          month,
          year,
          startDate,
          endDate
        },
        users: {
          new: newUsers,
          verified: verifiedUsers,
          verificationRate: newUsers > 0 ? (verifiedUsers / newUsers * 100).toFixed(2) : 0
        },
        tournaments: {
          new: newTournaments,
          completed: completedTournaments,
          categoryDistribution
        },
        transactions: formattedTransactions,
        financials: {
          totalRevenue,
          dailyStats
        }
      }
    });
  } catch (error) {
    console.error('Error generating monthly report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating monthly report',
      error: error.message
    });
  }
});

// Export the router
module.exports = router;