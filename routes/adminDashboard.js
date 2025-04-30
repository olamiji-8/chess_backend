const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Transaction = require('../models/Transaction');
const VerificationRequest = require('../models/verification');
const { admin} = require('../middleware/authMiddleware');


/**
 * PLAYER MANAGEMENT
 */

// Get all players with stats
router.get('/players', async (req, res) => {
  try {
    const players = await User.aggregate([
      {
        $match: { role: 'user' }
      },
      {
        $project: {
          fullName: 1,
          email: 1,
          profilePic: 1,
          lichessUsername: 1,
          isVerified: 1,
          createdAt: 1,
          registeredTournamentsCount: { $size: '$registeredTournaments' },
          createdTournamentsCount: { $size: '$createdTournaments' },
          walletBalance: 1
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);

    res.status(200).json({
      success: true,
      count: players.length,
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
    }).select('title startDate status participants').lean();

    // Get registered tournaments
    const registeredTournaments = await Tournament.find({
      participants: userId
    }).select('title startDate status').lean();

    // Get transaction history
    const transactions = await Transaction.find({
      user: userId
    }).sort({ createdAt: -1 }).lean();

    // Calculate total points (assuming you have a field for this or need to calculate it)
    // This is a placeholder - implement based on your points system
    const totalPoints = 0; // Replace with actual calculation

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
          totalPoints: totalPoints,
          totalCreated: createdTournaments.length,
          totalRegistered: registeredTournaments.length
        },
        transactions: transactions
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

// Ban a player (disable account)
router.put('/players/:userId/ban', async (req, res) => {
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

    // Add a new field to track banned status
    user.isBanned = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User has been banned',
      data: {
        userId: user._id,
        isBanned: user.isBanned
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

// Get all verification requests
router.get('/verifications', async (req, res) => {
  try {
    const status = req.query.status || 'pending'; // Default to pending

    const verifications = await VerificationRequest.find({ status })
      .populate('user', 'fullName email lichessUsername')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: verifications.length,
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

/**
 * WITHDRAWAL MANAGEMENT
 */

// Get all withdrawal requests
router.get('/withdrawals', async (req, res) => {
  try {
    const status = req.query.status || 'pending'; // Default to pending

    const withdrawals = await Transaction.find({
      type: 'withdrawal',
      status: status
    })
      .populate('user', 'fullName email lichessUsername')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: withdrawals.length,
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

// Approve a withdrawal request
router.put('/withdrawals/:transactionId/approve', async (req, res) => {
  try {
    const transactionId = req.params.transactionId;

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction ID'
      });
    }

    const transaction = await Transaction.findById(transactionId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.type !== 'withdrawal') {
      return res.status(400).json({
        success: false,
        message: 'Transaction is not a withdrawal'
      });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Transaction is already ${transaction.status}`
      });
    }

    // Update transaction status
    transaction.status = 'completed';
    transaction.lastUpdated = Date.now();
    transaction.details = {
      ...transaction.details,
      processedBy: req.user._id,
      processedAt: new Date()
    };
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Withdrawal request approved',
      data: transaction
    });
  } catch (error) {
    console.error('Error approving withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving withdrawal',
      error: error.message
    });
  }
});

// Decline a withdrawal request
router.put('/withdrawals/:transactionId/decline', async (req, res) => {
  try {
    const { reason } = req.body;
    const transactionId = req.params.transactionId;

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction ID'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Decline reason is required'
      });
    }

    const transaction = await Transaction.findById(transactionId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.type !== 'withdrawal') {
      return res.status(400).json({
        success: false,
        message: 'Transaction is not a withdrawal'
      });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Transaction is already ${transaction.status}`
      });
    }

    // Get the user to refund the amount
    const user = await User.findById(transaction.user);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Refund the amount to the user's wallet
    user.walletBalance += transaction.amount;
    await user.save();

    // Update transaction status
    transaction.status = 'failed';
    transaction.lastUpdated = Date.now();
    transaction.details = {
      ...transaction.details,
      declinedBy: req.user._id,
      declinedAt: new Date(),
      declineReason: reason
    };
    await transaction.save();

    // Create a refund transaction record
    const refundTransaction = new Transaction({
      user: user._id,
      type: 'refund',
      amount: transaction.amount,
      reference: `REFUND-${transaction.reference}`,
      paymentMethod: 'wallet',
      status: 'completed',
      details: {
        originalTransaction: transaction._id,
        reason: `Withdrawal declined: ${reason}`
      }
    });
    await refundTransaction.save();

    res.status(200).json({
      success: true,
      message: 'Withdrawal request declined and amount refunded',
      data: {
        transaction,
        refundTransaction
      }
    });
  } catch (error) {
    console.error('Error declining withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Error declining withdrawal',
      error: error.message
    });
  }
});

/**
 * TOURNAMENT MANAGEMENT
 */

// Get all tournaments
router.get('/tournaments', async (req, res) => {
  try {
    const { status } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    }

    const tournaments = await Tournament.find(query)
      .populate('organizer', 'fullName email lichessUsername')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: tournaments.length,
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
      .populate('organizer', 'fullName email lichessUsername')
      .populate('participants', 'fullName email lichessUsername');

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    res.status(200).json({
      success: true,
      data: tournament
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

// Disable a tournament
router.put('/tournaments/:tournamentId/disable', async (req, res) => {
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

    // Set tournament status to cancelled
    tournament.status = 'cancelled';
    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Tournament has been disabled',
      data: tournament
    });
  } catch (error) {
    console.error('Error disabling tournament:', error);
    res.status(500).json({
      success: false,
      message: 'Error disabling tournament',
      error: error.message
    });
  }
});

// Enable a tournament
router.put('/tournaments/:tournamentId/enable', async (req, res) => {
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

    // Set tournament status to upcoming
    if (tournament.status === 'cancelled') {
      tournament.status = 'upcoming';
      await tournament.save();
    } else {
      return res.status(400).json({
        success: false,
        message: `Cannot enable tournament with status ${tournament.status}`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tournament has been enabled',
      data: tournament
    });
  } catch (error) {
    console.error('Error enabling tournament:', error);
    res.status(500).json({
      success: false,
      message: 'Error enabling tournament',
      error: error.message
    });
  }
});

// Delete a tournament
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

    // If tournament is active or has participants, prevent deletion
    if (tournament.status === 'active' || (tournament.participants && tournament.participants.length > 0)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete tournament that is active or has participants'
      });
    }

    // Remove tournament from users' created tournaments
    await User.updateOne(
      { _id: tournament.organizer },
      { $pull: { createdTournaments: tournamentId } }
    );

    // Remove tournament from all users' registered tournaments
    if (tournament.participants && tournament.participants.length > 0) {
      await User.updateMany(
        { _id: { $in: tournament.participants } },
        { $pull: { registeredTournaments: tournamentId } }
      );
    }

    // Delete the tournament
    await Tournament.findByIdAndDelete(tournamentId);

    res.status(200).json({
      success: true,
      message: 'Tournament has been deleted',
      data: { tournamentId }
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

// Award points to player
router.post('/tournaments/:tournamentId/award-points', async (req, res) => {
  try {
    const { userId, points, reason } = req.body;
    const tournamentId = req.params.tournamentId;

    if (!mongoose.Types.ObjectId.isValid(tournamentId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tournament ID or user ID'
      });
    }

    if (!points || points <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Points must be a positive number'
      });
    }

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is a participant in the tournament
    if (!tournament.participants.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'User is not a participant in this tournament'
      });
    }

    // Create a new points record (you'd need to add a Points model)
    // This is a placeholder - implement based on your points system
    const pointsRecord = {
      user: userId,
      tournament: tournamentId,
      points: points,
      reason: reason || 'Tournament performance',
      awardedBy: req.user._id,
      awardedAt: new Date()
    };

    // Save points record to database
    // await Points.create(pointsRecord);

    res.status(200).json({
      success: true,
      message: 'Points awarded successfully',
      data: pointsRecord
    });
  } catch (error) {
    console.error('Error awarding points:', error);
    res.status(500).json({
      success: false,
      message: 'Error awarding points',
      error: error.message
    });
  }
});

/**
 * ORGANIZER MANAGEMENT
 */

// Get all tournament organizers
router.get('/organizers', async (req, res) => {
  try {
    // Find users who have created tournaments
    const organizers = await User.aggregate([
      {
        $match: {
          createdTournaments: { $exists: true, $ne: [] }
        }
      },
      {
        $project: {
          fullName: 1,
          email: 1,
          lichessUsername: 1,
          isVerified: 1,
          createdAt: 1,
          tournamentCount: { $size: '$createdTournaments' }
        }
      },
      {
        $sort: { tournamentCount: -1 }
      }
    ]);

    res.status(200).json({
      success: true,
      count: organizers.length,
      data: organizers
    });
  } catch (error) {
    console.error('Error fetching organizers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching organizers',
      error: error.message
    });
  }
});

// Revoke organizer status
router.put('/organizers/:userId/revoke', async (req, res) => {
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

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'User is not verified'
      });
    }

    // Revoke verification status
    user.isVerified = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Organizer status revoked',
      data: {
        userId: user._id,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Error revoking organizer status:', error);
    res.status(500).json({
      success: false,
      message: 'Error revoking organizer status',
      error: error.message
    });
  }
});

/**
 * DASHBOARD STATISTICS
 */

// Get admin dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();
    
    // Get total tournaments count
    const totalTournaments = await Tournament.countDocuments();
    
    // Get active tournaments count
    const activeTournaments = await Tournament.countDocuments({ status: 'active' });
    
    // Get pending withdrawals count
    const pendingWithdrawals = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'pending' 
    });
    
    // Get pending verifications count
    const pendingVerifications = await VerificationRequest.countDocuments({
      status: 'pending'
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

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers
        },
        tournaments: {
          total: totalTournaments,
          active: activeTournaments
        },
        withdrawals: {
          pending: pendingWithdrawals
        },
        verifications: {
          pending: pendingVerifications
        },
        transactions: {
          byType: transactionsByType,
          totalAmount: totalTransactionAmount
        }
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

module.exports = router;