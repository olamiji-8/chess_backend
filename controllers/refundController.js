const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Tournament = require('../models/Tournament');

/**
 * Refund Controller for handling transaction refunds
 */
class RefundController {
  
  /**
   * Create a refund transaction for a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createRefund(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { 
        originalTransactionId, 
        refundAmount, 
        reason, 
        refundToWallet = true 
      } = req.body;
      
      // Validate required fields
      if (!originalTransactionId || !refundAmount) {
        return res.status(400).json({
          success: false,
          message: 'Original transaction ID and refund amount are required'
        });
      }
      
      // Find the original transaction
      const originalTransaction = await Transaction.findById(originalTransactionId)
        .populate('user', 'fullName email walletBalance')
        .populate('tournament', 'title')
        .session(session);
      
      if (!originalTransaction) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Original transaction not found'
        });
      }
      
      // Validate refund amount
      if (refundAmount > originalTransaction.amount) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Refund amount cannot be greater than original transaction amount'
        });
      }
      
      // Check if transaction is eligible for refund
      if (originalTransaction.status === 'refunded') {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Transaction has already been refunded'
        });
      }
      
      // Generate unique reference for refund
      const refundReference = `REFUND_${Date.now()}_${originalTransaction.reference}`;
      
      // Create refund transaction
      const refundTransaction = new Transaction({
        user: originalTransaction.user._id,
        tournament: originalTransaction.tournament?._id,
        type: 'refund',
        amount: refundAmount,
        reference: refundReference,
        paymentMethod: originalTransaction.paymentMethod,
        status: 'pending',
        details: {
          originalTransactionId: originalTransaction._id,
          originalReference: originalTransaction.reference,
          refundReason: reason || 'Administrative refund',
          refundToWallet: refundToWallet,
          processedBy: req.user._id,
          processedAt: new Date()
        },
        metadata: {
          originalTransactionType: originalTransaction.type,
          originalAmount: originalTransaction.amount,
          refundType: 'admin_initiated'
        }
      });
      
      await refundTransaction.save({ session });
      
      // Update user's wallet balance if refunding to wallet
      if (refundToWallet) {
        await User.findByIdAndUpdate(
          originalTransaction.user._id,
          { $inc: { walletBalance: refundAmount } },
          { session }
        );
      }
      
      // Update original transaction status
      await Transaction.findByIdAndUpdate(
        originalTransactionId,
        { 
          status: 'refunded',
          metadata: {
            ...originalTransaction.metadata,
            refundedAt: new Date(),
            refundTransactionId: refundTransaction._id,
            refundAmount: refundAmount
          }
        },
        { session }
      );
      
      // If it was a tournament entry, remove user from tournament participants
      if (originalTransaction.type === 'tournament_entry' && originalTransaction.tournament) {
        await Tournament.findByIdAndUpdate(
          originalTransaction.tournament._id,
          { $pull: { participants: originalTransaction.user._id } },
          { session }
        );
        
        // Also remove from user's registered tournaments
        await User.findByIdAndUpdate(
          originalTransaction.user._id,
          { $pull: { registeredTournaments: originalTransaction.tournament._id } },
          { session }
        );
      }
      
      // Mark refund as completed
      refundTransaction.status = 'completed';
      await refundTransaction.save({ session });
      
      await session.commitTransaction();
      
      res.status(200).json({
        success: true,
        message: 'Refund processed successfully',
        data: {
          refundTransaction: refundTransaction,
          originalTransaction: originalTransaction,
          refundedAmount: refundAmount,
          newWalletBalance: originalTransaction.user.walletBalance + refundAmount
        }
      });
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Refund processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing refund',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Get refund history for a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getRefundHistory(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      
      const refunds = await Transaction.find({
        user: userId,
        type: 'refund'
      })
      .populate('user', 'fullName email')
      .populate('tournament', 'title')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();
      
      const totalRefunds = await Transaction.countDocuments({
        user: userId,
        type: 'refund'
      });
      
      res.status(200).json({
        success: true,
        data: {
          refunds,
          totalRefunds,
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalRefunds / limit)
        }
      });
      
    } catch (error) {
      console.error('Error getting refund history:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving refund history',
        error: error.message
      });
    }
  }
  
  /**
   * Get all refunds (Admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAllRefunds(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        status, 
        dateFrom, 
        dateTo 
      } = req.query;
      
      // Build query filter
      const filter = { type: 'refund' };
      
      if (status) {
        filter.status = status;
      }
      
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) {
          filter.createdAt.$gte = new Date(dateFrom);
        }
        if (dateTo) {
          filter.createdAt.$lte = new Date(dateTo);
        }
      }
      
      const refunds = await Transaction.find(filter)
        .populate('user', 'fullName email lichessUsername')
        .populate('tournament', 'title')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean();
      
      const totalRefunds = await Transaction.countDocuments(filter);
      
      // Calculate refund statistics
      const refundStats = await Transaction.aggregate([
        { $match: { type: 'refund' } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);
      
      res.status(200).json({
        success: true,
        data: {
          refunds,
          totalRefunds,
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalRefunds / limit),
          statistics: refundStats
        }
      });
      
    } catch (error) {
      console.error('Error getting all refunds:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving refunds',
        error: error.message
      });
    }
  }
  
  /**
   * Bulk refund processing for multiple transactions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkRefund(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { transactionIds, reason } = req.body;
      
      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Transaction IDs array is required'
        });
      }
      
      const results = {
        successful: [],
        failed: []
      };
      
      for (const transactionId of transactionIds) {
        try {
          const transaction = await Transaction.findById(transactionId)
            .populate('user')
            .session(session);
          
          if (!transaction) {
            results.failed.push({
              transactionId,
              error: 'Transaction not found'
            });
            continue;
          }
          
          if (transaction.status === 'refunded') {
            results.failed.push({
              transactionId,
              error: 'Already refunded'
            });
            continue;
          }
          
          // Process individual refund
          const refundReference = `BULK_REFUND_${Date.now()}_${transaction.reference}`;
          
          const refundTransaction = new Transaction({
            user: transaction.user._id,
            tournament: transaction.tournament,
            type: 'refund',
            amount: transaction.amount,
            reference: refundReference,
            paymentMethod: transaction.paymentMethod,
            status: 'completed',
            details: {
              originalTransactionId: transaction._id,
              originalReference: transaction.reference,
              refundReason: reason || 'Bulk administrative refund',
              refundToWallet: true,
              processedBy: req.user._id,
              processedAt: new Date(),
              bulkRefund: true
            }
          });
          
          await refundTransaction.save({ session });
          
          // Update user wallet
          await User.findByIdAndUpdate(
            transaction.user._id,
            { $inc: { walletBalance: transaction.amount } },
            { session }
          );
          
          // Update original transaction
          await Transaction.findByIdAndUpdate(
            transactionId,
            { 
              status: 'refunded',
              metadata: {
                ...transaction.metadata,
                refundedAt: new Date(),
                refundTransactionId: refundTransaction._id,
                refundAmount: transaction.amount
              }
            },
            { session }
          );
          
          results.successful.push({
            transactionId,
            refundTransactionId: refundTransaction._id,
            amount: transaction.amount
          });
          
        } catch (error) {
          results.failed.push({
            transactionId,
            error: error.message
          });
        }
      }
      
      await session.commitTransaction();
      
      res.status(200).json({
        success: true,
        message: 'Bulk refund processing completed',
        data: {
          totalProcessed: transactionIds.length,
          successful: results.successful.length,
          failed: results.failed.length,
          results
        }
      });
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Bulk refund error:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing bulk refunds',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Get refund details by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getRefundDetails(req, res) {
    try {
      const { refundId } = req.params;
      
      const refund = await Transaction.findById(refundId)
        .populate('user', 'fullName email lichessUsername walletBalance')
        .populate('tournament', 'title')
        .lean();
      
      if (!refund || refund.type !== 'refund') {
        return res.status(404).json({
          success: false,
          message: 'Refund transaction not found'
        });
      }
      
      // Get original transaction if available
      let originalTransaction = null;
      if (refund.details.originalTransactionId) {
        originalTransaction = await Transaction.findById(refund.details.originalTransactionId)
          .populate('tournament', 'title')
          .lean();
      }
      
      res.status(200).json({
        success: true,
        data: {
          refund,
          originalTransaction
        }
      });
      
    } catch (error) {
      console.error('Error getting refund details:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving refund details',
        error: error.message
      });
    }
  }
}

module.exports = RefundController;