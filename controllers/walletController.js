const User = require('../models/User');
const Transaction = require('../models/Transaction');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const crypto = require('crypto');
const { verifyUserPin } = require('../utils/pinVerification');

// @desc    Initiate deposit to wallet with PIN verification
// @route   POST /api/wallet/deposit
// @access  Private
exports.initiateDeposit = asyncHandler(async (req, res) => {
  const { amount, pin } = req.body;
  const userId = req.session.userId || req.user.id;
  
  // Validate amount
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Please provide a valid amount' });
  }
  
  // Validate PIN using the utility function
  const pinVerification = await verifyUserPin(userId, pin);
  
  if (!pinVerification.success) {
    return res.status(401).json({ message: pinVerification.message });
  }
  
  // Use the user object from verification
  const user = pinVerification.user;


  // Generate reference
  const reference = 'CHESS_' + crypto.randomBytes(8).toString('hex');
  
  // Create transaction record
  const transaction = await Transaction.create({
    user: userId,
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
      message: 'Failed to initialize payment. Please try again later.'
    });
  }
});


// // @desc    Handle Paystack webhook
// // @route   POST /api/wallet/webhook
// // @access  Public
// exports.handlePaystackWebhook = asyncHandler(async (req, res) => {
//   // Verify that the request is from Paystack
//   const hash = crypto
//     .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
//     .update(JSON.stringify(req.body))
//     .digest('hex');
  
//   if (hash !== req.headers['x-paystack-signature']) {
//     return res.status(401).json({ message: 'Invalid signature' });
//   }
  
//   // Process the webhook payload
//   const event = req.body;
  
//   // Handle the event based on its type
//   switch(event.event) {
//     case 'charge.success':
//       // Extract the reference and verify transaction
//       const { reference, status, amount } = event.data;
      
//       // Find the transaction in our database
//       const transaction = await Transaction.findOne({ reference });
      
//       if (!transaction) {
//         // Log the issue but return 200 to acknowledge receipt
//         console.error(`Transaction with reference ${reference} not found`);
//         return res.sendStatus(200);
//       }
      
//       // If transaction already completed, just acknowledge
//       if (transaction.status === 'completed') {
//         return res.sendStatus(200);
//       }
      
//       // Update transaction status
//       if (status === 'success') {
//         transaction.status = 'completed';
//         await transaction.save();
        
//         // Update user wallet balance
//         const user = await User.findById(transaction.user);
//         user.walletBalance += (amount / 100); // Convert from kobo to naira
//         await user.save();
        
//         console.log(`Deposit successful: ${amount / 100} naira added to user ${user._id}`);
//       } else {
//         transaction.status = 'failed';
//         await transaction.save();
//         console.log(`Payment verification failed for reference ${reference}`);
//       }
//       break;
      
//     case 'transfer.success':
//       // Handle successful withdrawal transfers if you implement Paystack transfers
//       // Similar logic to above but for withdrawal transactions
//       break;
      
//     case 'transfer.failed':
//       // Handle failed withdrawal transfers
//       break;

// @desc    Verify deposit callback
// @route   GET /api/wallet/verify/:reference
// @access  Public
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

// @desc    Initiate withdrawal with PIN verification
// @route   POST /api/wallet/withdraw
// @access  Private
exports.initiateWithdrawal = asyncHandler(async (req, res) => {
  const { amount, pin } = req.body;
  const userId = req.session.userId || req.user.id;
  
  // Validate amount
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Please provide a valid amount' });
  }
  
  // Validate PIN using the utility function
  const pinVerification = await verifyUserPin(userId, pin);
  
  if (!pinVerification.success) {
    return res.status(401).json({ message: pinVerification.message });
  }
  
  // Use the user object from verification
  const user = pinVerification.user;

  
  
  // Check wallet balance
  if (user.walletBalance < amount) {
    return res.status(400).json({ 
      message: 'Insufficient wallet balance', 
      walletBalance: user.walletBalance,
      requestedAmount: amount
    });
  }
  
  // Check if bank details are provided
  if (!user.bankDetails || !user.bankDetails.accountNumber || !user.bankDetails.bankName) {
    return res.status(400).json({ message: 'Please update your bank details before withdrawal' });
  }
  
  // Check if user is verified
  if (!user.isVerified) {
    return res.status(403).json({ message: 'Account verification is required before making withdrawals. Please verify your account first.' });
  }
  
  // Generate reference
  const reference = 'CHESS_WD_' + crypto.randomBytes(8).toString('hex');
  
  // Create transaction record
  const transaction = await Transaction.create({
    user: userId,
    type: 'withdrawal',
    amount,
    reference,
    status: 'pending',
    paymentMethod: 'bank_transfer',
    details: {
      bankName: user.bankDetails.bankName,
      accountNumber: user.bankDetails.accountNumber,
      accountName: user.bankDetails.accountName || user.fullName
    }
  });
  
  // Deduct from wallet balance
  user.walletBalance -= amount;
  await user.save();
  
  // In a real app, we would integrate with Paystack Transfer API here
  
  res.status(200).json({
    success: true,
    message: 'Withdrawal request initiated successfully. Please allow 1-2 business days for processing.',
    data: {
      amount,
      newBalance: user.walletBalance,
      reference,
      estimatedProcessingTime: '1-2 business days'
    }
  });
});

// @desc    Get all transaction history with pagination
// @route   GET /api/wallet/transactions
// @access  Private
exports.getTransactions = asyncHandler(async (req, res) => {
  const userId = req.session.userId || req.user.id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  
  const total = await Transaction.countDocuments({ user: userId });
  
  const transactions = await Transaction.find({ user: userId })
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

// @desc    Get wallet balance
// @route   GET /api/wallet/balance
// @access  Private
exports.getWalletBalance = asyncHandler(async (req, res) => {
  const userId = req.session.userId || req.user.id;
  const user = await User.findById(userId);
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  res.status(200).json({
    success: true,
    walletBalance: user.walletBalance
  });
});

