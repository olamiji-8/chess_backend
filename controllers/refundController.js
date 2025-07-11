const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Tournament = require('../models/Tournament');

/**
 * Clawback Controller for recovering funds due to system glitches
 */
class ClawbackController {
  
  /**
   * Create a clawback transaction to recover funds from a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createClawback(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { 
        userId, 
        clawbackAmount, 
        reason,
        originalTransactionId = null // Optional reference to the glitched transaction
      } = req.body;
      
      // Validate required fields
      if (!userId || !clawbackAmount) {
        return res.status(400).json({
          success: false,
          message: 'User ID and clawback amount are required'
        });
      }
      
      // Find the user
      const user = await User.findById(userId).session(session);
      
      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Check if user has sufficient balance
      if (user.walletBalance < clawbackAmount) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Insufficient funds. User has ${user.walletBalance}, trying to clawback ${clawbackAmount}`
        });
      }
      
      // Generate unique reference for clawback
      const clawbackReference = `CLAWBACK_${Date.now()}_${userId}`;
      
      // Create clawback transaction
      const clawbackTransaction = new Transaction({
        user: userId,
        type: 'clawback',
        amount: clawbackAmount,
        reference: clawbackReference,
        paymentMethod: 'wallet', // FIXED: Changed from 'wallet_deduction' to 'wallet'
        status: 'completed',
        details: {
          originalTransactionId: originalTransactionId,
          clawbackReason: reason || 'System glitch recovery',
          processedBy: req.user._id,
          processedAt: new Date(),
          userBalanceBefore: user.walletBalance,
          userBalanceAfter: user.walletBalance - clawbackAmount
        },
        metadata: {
          clawbackType: 'admin_initiated',
          recoveryAction: true
        }
      });
      
      await clawbackTransaction.save({ session });
      
      // Deduct from user's wallet balance
      await User.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: -clawbackAmount } }, // Negative increment = deduction
        { session }
      );
      
      await session.commitTransaction();
      
      res.status(200).json({
        success: true,
        message: 'Clawback processed successfully',
        data: {
          clawbackTransaction: clawbackTransaction,
          user: {
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            previousBalance: user.walletBalance,
            newBalance: user.walletBalance - clawbackAmount
          },
          recoveredAmount: clawbackAmount
        }
      });
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Clawback processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing clawback',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Bulk clawback processing for multiple users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkClawback(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { userClawbacks, reason } = req.body;
      
      // userClawbacks should be an array like: [{ userId: 'xxx', amount: 100 }, ...]
      if (!userClawbacks || !Array.isArray(userClawbacks) || userClawbacks.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'User clawbacks array is required'
        });
      }
      
      const results = {
        successful: [],
        failed: []
      };
      
      for (const clawback of userClawbacks) {
        try {
          const { userId, amount } = clawback;
          
          const user = await User.findById(userId).session(session);
          
          if (!user) {
            results.failed.push({
              userId,
              error: 'User not found'
            });
            continue;
          }
          
          if (user.walletBalance < amount) {
            results.failed.push({
              userId,
              error: `Insufficient funds. Has ${user.walletBalance}, trying to clawback ${amount}`
            });
            continue;
          }
          
          // Process individual clawback
          const clawbackReference = `BULK_CLAWBACK_${Date.now()}_${userId}`;
          
          const clawbackTransaction = new Transaction({
            user: userId,
            type: 'clawback',
            amount: amount,
            reference: clawbackReference,
            paymentMethod: 'wallet', // FIXED: Changed from 'wallet_deduction' to 'wallet'
            status: 'completed',
            details: {
              clawbackReason: reason || 'Bulk system glitch recovery',
              processedBy: req.user._id,
              processedAt: new Date(),
              bulkClawback: true,
              userBalanceBefore: user.walletBalance,
              userBalanceAfter: user.walletBalance - amount
            }
          });
          
          await clawbackTransaction.save({ session });
          
          // Update user wallet
          await User.findByIdAndUpdate(
            userId,
            { $inc: { walletBalance: -amount } }, // Negative increment = deduction
            { session }
          );
          
          results.successful.push({
            userId,
            clawbackTransactionId: clawbackTransaction._id,
            amount: amount,
            userEmail: user.email,
            previousBalance: user.walletBalance,
            newBalance: user.walletBalance - amount
          });
          
        } catch (error) {
          results.failed.push({
            userId: clawback.userId,
            error: error.message
          });
        }
      }
      
      await session.commitTransaction();
      
      res.status(200).json({
        success: true,
        message: 'Bulk clawback processing completed',
        data: {
          totalProcessed: userClawbacks.length,
          successful: results.successful.length,
          failed: results.failed.length,
          totalRecovered: results.successful.reduce((sum, item) => sum + item.amount, 0),
          results
        }
      });
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Bulk clawback error:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing bulk clawbacks',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Clawback all available funds from a user (emergency recovery)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async clawbackAllFunds(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { userId, reason } = req.body;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }
      
      const user = await User.findById(userId).session(session);
      
      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      if (user.walletBalance <= 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'User has no funds to clawback'
        });
      }
      
      const clawbackAmount = user.walletBalance;
      const clawbackReference = `FULL_CLAWBACK_${Date.now()}_${userId}`;
      
      const clawbackTransaction = new Transaction({
        user: userId,
        type: 'clawback',
        amount: clawbackAmount,
        reference: clawbackReference,
        paymentMethod: 'wallet', // FIXED: Changed from 'wallet_deduction' to 'wallet'
        status: 'completed',
        details: {
          clawbackReason: reason || 'Emergency fund recovery - all available funds',
          processedBy: req.user._id,
          processedAt: new Date(),
          fullClawback: true,
          userBalanceBefore: user.walletBalance,
          userBalanceAfter: 0
        }
      });
      
      await clawbackTransaction.save({ session });
      
      // Set user wallet balance to 0
      await User.findByIdAndUpdate(
        userId,
        { walletBalance: 0 },
        { session }
      );
      
      await session.commitTransaction();
      
      res.status(200).json({
        success: true,
        message: 'Full clawback processed successfully',
        data: {
          clawbackTransaction: clawbackTransaction,
          user: {
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            previousBalance: user.walletBalance,
            newBalance: 0
          },
          recoveredAmount: clawbackAmount
        }
      });
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Full clawback processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing full clawback',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Get all clawback transactions (Admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAllClawbacks(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        dateFrom, 
        dateTo 
      } = req.query;
      
      // Build query filter
      const filter = { type: 'clawback' };
      
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) {
          filter.createdAt.$gte = new Date(dateFrom);
        }
        if (dateTo) {
          filter.createdAt.$lte = new Date(dateTo);
        }
      }
      
      const clawbacks = await Transaction.find(filter)
        .populate('user', 'fullName email lichessUsername')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean();
      
      const totalClawbacks = await Transaction.countDocuments(filter);
      
      // Calculate clawback statistics
      const clawbackStats = await Transaction.aggregate([
        { $match: { type: 'clawback' } },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);
      
      res.status(200).json({
        success: true,
        data: {
          clawbacks,
          totalClawbacks,
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalClawbacks / limit),
          statistics: clawbackStats[0] || { totalAmount: 0, count: 0 }
        }
      });
      
    } catch (error) {
      console.error('Error getting all clawbacks:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving clawbacks',
        error: error.message
      });
    }
  }
}

module.exports = ClawbackController;