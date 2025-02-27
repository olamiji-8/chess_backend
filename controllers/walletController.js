const User = require('../models/User');
const Transaction = require('../models/Transaction');
const asyncHandler = require('express-async-handler');
const axios = require('axios');
const crypto = require('crypto');

// @desc    Initiate deposit to wallet
// @route   POST /api/wallet/deposit
// @access  Private
exports.initiateDeposit = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ message: 'Please provide a valid amount' });
  }
  
  const user = await User.findById(req.user.id);
  
  // Generate reference
  const reference = 'CHESS_' + crypto.randomBytes(8).toString('hex');
  
  // Create transaction record
  const transaction = await Transaction.create({
    user: req.user.id,
    type: 'deposit',
    amount,
    reference,
    status: 'pending',
    paymentMethod: 'paystack'
  });
  
  // Initialize Paystack transaction
  try {
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email,
        amount: amount * 100, // Paystack expects amount in kobo
        reference,
        callback_url: process.env.PAYSTACK_CALLBACK_URL
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.status(200).json({
      success: true,
      data: {
        authorizationUrl: paystackResponse.data.data.authorization_url,
        reference
      }
    });
  } catch (error) {
    // Update transaction status to failed
    transaction.status = 'failed';
    await transaction.save();
    
    console.error('Paystack Error:', error.response ? error.response.data : error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize payment'
    });
  }
});

// @desc    Verify deposit callback
// @route   GET /api/wallet/verify/:reference
// @access  Private
exports.verifyDeposit = asyncHandler(async (req, res) => {
  const { reference } = req.params;
  
  try {
    // Verify transaction with Paystack
    const paystackResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const { status, amount } = paystackResponse.data.data;
    
    // Find transaction
    const transaction = await Transaction.findOne({ reference });
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    // Update transaction status
    if (status === 'success') {
      transaction.status = 'completed';
      await transaction.save();
      
      // Update user wallet balance
      const user = await User.findById(transaction.user);
      user.walletBalance += (amount / 100); // Convert from kobo to naira
      await user.save();
      
      return res.status(200).json({
        success: true,
        message: 'Deposit successful',
        data: {
          amount: amount / 100,
          newBalance: user.walletBalance
        }
      });
    } else {
      transaction.status = 'failed';
      await transaction.save();
      
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
  } catch (error) {
    console.error('Verification Error:', error.response ? error.response.data : error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment'
    });
  }
});

// @desc    Initiate withdrawal
// @route   POST /api/wallet/withdraw
// @access  Private
exports.initiateWithdrawal = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ message: 'Please provide a valid amount' });
  }
  
  const user = await User.findById(req.user.id);
  
  // Check wallet balance
  if (user.walletBalance < amount) {
    return res.status(400).json({ message: 'Insufficient wallet balance' });
  }
  
  // Check if bank details are provided
  if (!user.bankDetails || !user.bankDetails.accountNumber || !user.bankDetails.bankName) {
    return res.status(400).json({ message: 'Please update your bank details before withdrawal' });
  }
  
  // Generate reference
  const reference = 'CHESS_WD_' + crypto.randomBytes(8).toString('hex');
  
  // Create transaction record
  await Transaction.create({
    user: req.user.id,
    type: 'withdrawal',
    amount,
    reference,
    status: 'pending',
    paymentMethod: 'bank_transfer'
  });
  
  // Deduct from wallet balance
  user.walletBalance -= amount;
  await user.save();
  
  // In a real app, you would integrate with Paystack Transfer API here
  // For simplicity, we'll mark it as completed
  
  res.status(200).json({
    success: true,
    message: 'Withdrawal request initiated successfully',
    data: {
      amount,
      newBalance: user.walletBalance,
      reference
    }
  });
});

// @desc    Get wallet transaction history
// @route   GET /api/wallet/transactions
// @access  Private
exports.getTransactions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  
  const total = await Transaction.countDocuments({ user: req.user.id });
  
  const transactions = await Transaction.find({ user: req.user.id })
    .populate('tournament', 'title')
    .skip(startIndex)
    .limit(limit)
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: transactions.length,
    total,
    pagination: {
      current: page,
      totalPages: Math.ceil(total / limit)
    },
    data: transactions
  });
});