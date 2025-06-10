const User = require('../models/User');
const Transaction = require('../models/Transaction');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const crypto = require('crypto');
const { verifyUserPin } = require('../utils/pinVerification');
const { processSuccessfulPayment } = require('../utils/processSuccessfulPayment');

// @desc    Initiate deposit to wallet with PIN verification and optional recipient transfer
// @route   POST /api/wallet/deposit
// @access  Private
exports.initiateDeposit = asyncHandler(async (req, res) => {
  try {
    const { amount, pin, recipientAccountNumber, isTransferToRecipient, paymentMethod } = req.body;
    
    // Ensure user exists
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'User authentication failed' });
    }
    
    const userId = req.user._id || req.user.id;
    
    // Validate amount
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Please provide a valid amount' });
    }
    
    // Validate PIN 
    const pinVerification = await verifyUserPin(userId, pin);
    
    if (!pinVerification.success) {
      return res.status(401).json({ message: pinVerification.message });
    }
    
    // Get full user data AFTER pin verification
    const user = await User.findById(userId);
    
    if (!user || !user.email) {
      return res.status(404).json({ message: 'User data incomplete or missing' });
    }
    
    // Check if this is a transfer to another user
    let recipientUser = null;
    if (isTransferToRecipient && recipientAccountNumber) {
      // Find recipient user by Paystack account number
      recipientUser = await User.findOne({ 'bankDetails.accountNumber': recipientAccountNumber });
      
      if (!recipientUser) {
        return res.status(404).json({ 
          success: false, 
          message: 'Recipient with this account number not found' 
        });
      }
    }

    // Generate reference
    const reference = 'CHESS_' + crypto.randomBytes(8).toString('hex');
    
    // Create transaction record
    const transaction = await Transaction.create({
      user: userId,
      type: recipientUser ? 'transfer' : 'deposit',
      amount,
      reference,
      status: 'pending',
      paymentMethod: paymentMethod || 'paystack',
      recipient: recipientUser ? recipientUser._id : null,
      details: recipientUser ? {
        recipientName: recipientUser.fullName,
        recipientAccountNumber: recipientAccountNumber
      } : {}
    });

    // Check for Titan payment method
    if (paymentMethod === 'titan') {
      try {
        // Split full name for Paystack requirements
        const nameParts = user.fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || 'User';
        
        // Generate a dedicated virtual account
        const titanResponse = await axios.post(
          'https://api.paystack.co/dedicated_account',
          {
            customer: user.paystackCustomerId || user.email,
            preferred_bank: 'wema-bank', 
            amount: amount * 100, // Amount in kobo
            reference,
            phone: user.phoneNumber || "08000000000",
            first_name: firstName,
            last_name: lastName
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        // Save virtual account details to transaction
        transaction.details = {
          ...transaction.details,
          titanAccountNumber: titanResponse.data.data.account_number,
          titanBankName: titanResponse.data.data.bank.name,
          titanAccountName: titanResponse.data.data.account_name,
          titanExpiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes expiry
        };
        await transaction.save();
        
        return res.status(200).json({
          success: true,
          data: {
            reference,
            method: 'titan',
            accountNumber: titanResponse.data.data.account_number,
            bankName: titanResponse.data.data.bank.name,
            accountName: titanResponse.data.data.account_name,
            amount,
            expiresIn: '30 minutes',
            isTransferToRecipient: !!recipientUser,
            recipientName: recipientUser ? recipientUser.fullName : null
          }
        });
      } catch (error) {
        console.error('Titan Error:', error.response ? error.response.data : error.message);
        
        // Instead of trying to reassign paymentMethod, just continue with standard Paystack
        console.log('Falling back to standard Paystack payment');
        
        // Use standard Paystack method instead of trying to reassign paymentMethod
        try {
          const paystackResponse = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
              email: user.email,
              amount: amount * 100,
              reference,
              callback_url: process.env.PAYSTACK_CALLBACK_URL,
              metadata: {
                userId: userId.toString(),
                transactionId: transaction._id.toString(),
                isTransferToRecipient: !!recipientUser,
                recipientId: recipientUser ? recipientUser._id.toString() : null
              }
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
              method: 'paystack',
              authorizationUrl: paystackResponse.data.data.authorization_url,
              reference,
              isTransferToRecipient: !!recipientUser,
              recipientName: recipientUser ? recipientUser.fullName : null
            }
          });
        } catch (paystackError) {
          // Update transaction status to failed
          transaction.status = 'failed';
          await transaction.save();
          
          console.error('Paystack Error:', paystackError.response ? paystackError.response.data : paystackError.message);
          res.status(500).json({
            success: false,
            message: 'Failed to initialize payment. Please try again later.'
          });
        }
      }
    } else {
      // Standard Paystack flow remains unchanged
      try {
        const paystackResponse = await axios.post(
          'https://api.paystack.co/transaction/initialize',
          {
            email: user.email,
            amount: amount * 100,
            reference,
            callback_url: process.env.PAYSTACK_CALLBACK_URL,
            metadata: {
              userId: userId.toString(),
              transactionId: transaction._id.toString(),
              isTransferToRecipient: !!recipientUser,
              recipientId: recipientUser ? recipientUser._id.toString() : null
            }
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
            method: 'paystack',
            authorizationUrl: paystackResponse.data.data.authorization_url,
            reference,
            isTransferToRecipient: !!recipientUser,
            recipientName: recipientUser ? recipientUser.fullName : null
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
    }
  } catch (error) {
    console.error('Deposit Error:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred'
    });
  }
});

// @desc    Check status of Titan account payment
// @route   GET /api/wallet/titan-status/:reference
// @access  Private
exports.checkTitanPaymentStatus = asyncHandler(async (req, res) => {
  const { reference } = req.params;
  
  if (!req.user) {
    return res.status(401).json({ message: 'User authentication failed' });
  }
  
  const transaction = await Transaction.findOne({ 
    reference, 
    user: req.user._id || req.user.id 
  });
  
  if (!transaction) {
    return res.status(404).json({ message: 'Transaction not found' });
  }
  
  // If transaction is already completed or failed
  if (transaction.status === 'completed') {
    return res.status(200).json({
      success: true,
      status: 'completed',
      message: 'Payment has been confirmed',
      walletBalance: req.user.walletBalance
    });
  }
  
  if (transaction.status === 'failed') {
    return res.status(200).json({
      success: false,
      status: 'failed',
      message: 'Payment failed or was declined'
    });
  }
  
  // For Titan account payments, check transaction list via Paystack
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction?reference=${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const transactions = response.data.data;
    
    if (transactions && transactions.length > 0) {
      const paystackTransaction = transactions[0];
      
      if (paystackTransaction.status === 'success') {
        // Process the successful payment
        await processSuccessfulPayment(transaction, paystackTransaction.amount, 'success');
        
        // Get updated user balance
        const user = await User.findById(req.user._id || req.user.id);
        
        return res.status(200).json({
          success: true,
          status: 'completed',
          message: 'Your payment has been confirmed',
          walletBalance: user.walletBalance
        });
      }
    }
    
    // Check if the Titan account has expired
    if (transaction.details.titanExpiresAt && new Date() > new Date(transaction.details.titanExpiresAt)) {
      transaction.status = 'expired';
      await transaction.save();
      
      return res.status(200).json({
        success: false,
        status: 'expired',
        message: 'The payment window has expired. Please initiate a new deposit.'
      });
    }
    
    // Payment is still pending
    return res.status(200).json({
      success: true,
      status: 'pending',
      message: 'We have not received your payment yet. Please complete the bank transfer.',
      accountDetails: {
        accountNumber: transaction.details.titanAccountNumber,
        bankName: transaction.details.titanBankName,
        accountName: transaction.details.titanAccountName,
        amount: transaction.amount,
        reference
      }
    });
    
  } catch (error) {
    console.error('Titan Status Error:', error.response ? error.response.data : error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status'
    });
  }
});

// @desc    Handle Paystack webhook
// @route   POST /api/wallet/webhook
// @access  Public
exports.handlePaystackWebhook = asyncHandler(async (req, res) => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  
  // Verify that the request is from Paystack
  const hash = crypto
    .createHmac('sha512', secretKey)
    .update(JSON.stringify(req.body))
    .digest('hex');
  
  if (hash !== req.headers['x-paystack-signature']) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ message: 'Invalid signature' });
  }
  
  // Process the webhook payload
  const event = req.body;
  
  console.log(`Received webhook event: ${event.event}`, JSON.stringify(event.data));
  
  // Handle the event based on its type
  switch(event.event) {
    case 'charge.success':
      await handleChargeSuccess(event.data);
      break;
      
    case 'transfer.success':
      await handleTransferSuccess(event.data);
      break;
      
    case 'transfer.failed':
      await handleTransferFailed(event.data);
      break;

    case 'charge.dispute.create':
      await handleDisputeCreate(event.data);
      break;
      
    // Add dedicated account event for Titan
    case 'dedicated_account.credit':
      await handleDedicatedAccountCredit(event.data);
      break;
      
    default:
      // Log unknown event types for future implementation
      console.log(`Unhandled webhook event: ${event.event}`);
      break;
  }
  
  // Always acknowledge receipt of the webhook
  return res.sendStatus(200);
});

// Handle dedicated_account.credit event for Titan accounts
const handleDedicatedAccountCredit = async (data) => {
  const { reference, amount } = data;
  
  if (!reference) {
    console.error('No reference in Titan account credit webhook data');
    return;
  }
  
  const transaction = await Transaction.findOne({ reference });
  
  if (!transaction) {
    console.error(`Transaction with reference ${reference} not found for Titan credit`);
    return;
  }
  
  await processSuccessfulPayment(transaction, amount, 'success');
  console.log(`Titan payment processed: ${amount/100} naira for transaction ${transaction._id}`);
};

// Handle charge.success event
const handleChargeSuccess = async (data) => {
  const { reference, status, amount, metadata } = data;
  
  // Find the transaction in our database
  const transaction = await Transaction.findOne({ reference });
  
  if (!transaction) {
    // If metadata contains transactionId, try to find by that
    if (metadata && metadata.transactionId) {
      const transactionById = await Transaction.findById(metadata.transactionId);
      if (transactionById) {
        await processSuccessfulPayment(transactionById, amount, status);
        return;
      }
    }
    console.error(`Transaction with reference ${reference} not found`);
    return;
  }
  
  await processSuccessfulPayment(transaction, amount, status);
};

// Handle transfer.success event
const handleTransferSuccess = async (data) => {
  const { reference } = data;
  const withdrawalTransaction = await Transaction.findOne({ 
    reference,
    type: 'withdrawal'
  });
  
  if (!withdrawalTransaction) {
    console.error(`Withdrawal transaction with reference ${reference} not found`);
    return;
  }
  
  // Update transaction status if not already completed
  if (withdrawalTransaction.status !== 'completed') {
    withdrawalTransaction.status = 'completed';
    await withdrawalTransaction.save();
    console.log(`Withdrawal successful: ${data.amount / 100} naira transferred to user ${withdrawalTransaction.user}`);
  }
};

// Handle transfer.failed event
const handleTransferFailed = async (data) => {
  const { reference } = data;
  const failedWithdrawalTransaction = await Transaction.findOne({ 
    reference,
    type: 'withdrawal'
  });
  
  if (!failedWithdrawalTransaction) {
    console.error(`Failed withdrawal transaction with reference ${reference} not found`);
    return;
  }
  
  // Update transaction status and refund user
  if (failedWithdrawalTransaction.status !== 'failed') {
    failedWithdrawalTransaction.status = 'failed';
    failedWithdrawalTransaction.details = {
      ...failedWithdrawalTransaction.details,
      failureReason: data.reason || 'Unknown reason'
    };
    await failedWithdrawalTransaction.save();
    
    // Refund user's wallet
    const userToRefund = await User.findById(failedWithdrawalTransaction.user);
    if (userToRefund) {
      userToRefund.walletBalance += failedWithdrawalTransaction.amount;
      await userToRefund.save();
      
      console.log(`Withdrawal failed: ${failedWithdrawalTransaction.amount} naira refunded to user ${failedWithdrawalTransaction.user}`);
    } else {
      console.error(`User ${failedWithdrawalTransaction.user} not found for failed withdrawal ${failedWithdrawalTransaction._id}`);
    }
  }
};

// Handle dispute.create event
const handleDisputeCreate = async (data) => {
  const { reference } = data;
  const disputedTransaction = await Transaction.findOne({ reference });
  
  if (disputedTransaction) {
    disputedTransaction.status = 'disputed';
    disputedTransaction.details = {
      ...disputedTransaction.details,
      dispute: {
        id: data.id,
        status: data.status,
        category: data.category,
        amount: data.amount
      }
    };
    await disputedTransaction.save();
    
    console.log(`Transaction ${reference} has been disputed`);
  }
};

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
// exports.initiateWithdrawal = asyncHandler(async (req, res) => {
//   try {
//     const { 
//       amount, 
//       pin, 
//       accountNumber, 
//       bankCode, 
//       bankName, 
//       accountName 
//     } = req.body;
    
//     // Check user authentication
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: 'User authentication failed' });
//     }
    
//     const userId = req.user._id || req.user.id;
    
//     // Validate required fields
//     if (!amount || !accountNumber || !bankCode || !bankName || !accountName) {
//       return res.status(400).json({ 
//         message: 'All fields are required: amount, account number, bank code, bank name, and account name' 
//       });
//     }
    
//     // Validate amount
//     if (isNaN(amount) || amount <= 0) {
//       return res.status(400).json({ message: 'Please provide a valid amount' });
//     }
    
//     // Minimum withdrawal amount
//     if (amount < 100) {
//       return res.status(400).json({ 
//         message: 'Minimum withdrawal amount is ₦100' 
//       });
//     }
    
//     // Validate PIN
//     const pinVerification = await verifyUserPin(userId, pin);
//     if (!pinVerification.success) {
//       return res.status(401).json({ message: pinVerification.message });
//     }
    
//     // Get user data
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }
    
//     // Check wallet balance
//     if (user.walletBalance < amount) {
//       return res.status(400).json({ 
//         message: 'Insufficient wallet balance',
//         walletBalance: user.walletBalance,
//         requestedAmount: amount
//       });
//     }
    
//     // Generate reference
//     const reference = 'CHESS_WD_' + crypto.randomBytes(8).toString('hex');
    
//     // Create transaction record
//     const transaction = await Transaction.create({
//       user: userId,
//       type: 'withdrawal',
//       amount,
//       reference,
//       status: 'pending',
//       paymentMethod: 'bank_transfer',
//       details: {
//         bankName,
//         bankCode,
//         accountNumber,
//         accountName,
//         requestedAt: new Date()
//       }
//     });
    
//     // Deduct amount from user's wallet
//     user.walletBalance -= amount;
//     await user.save();
    
//     try {
//       // Create transfer recipient in Paystack
//       const recipientResponse = await axios.post(
//         'https://api.paystack.co/transferrecipient',
//         {
//           type: 'nuban',
//           name: accountName,
//           account_number: accountNumber,
//           bank_code: bankCode,
//           currency: 'NGN'
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
//             'Content-Type': 'application/json'
//           }
//         }
//       );
      
//       const recipientCode = recipientResponse.data.data.recipient_code;
      
//       // Initiate transfer
//       const transferResponse = await axios.post(
//         'https://api.paystack.co/transfer',
//         {
//           source: 'balance',
//           amount: amount * 100, // Convert to kobo
//           recipient: recipientCode,
//           reason: 'Wallet withdrawal',
//           reference: reference
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
//             'Content-Type': 'application/json'
//           }
//         }
//       );
      
//       // Update transaction with success
//       transaction.status = 'completed';
//       transaction.details.recipientCode = recipientCode;
//       transaction.details.transferCode = transferResponse.data.data.transfer_code;
//       await transaction.save();
      
//       console.log(`Withdrawal successful: ₦${amount} to ${accountName} - Reference: ${reference}`);
      
//       res.status(200).json({
//         success: true,
//         message: 'Withdrawal successful! Money has been sent to your bank account.',
//         data: {
//           amount,
//           newBalance: user.walletBalance,
//           reference,
//           accountName,
//           bankName,
//           status: 'completed'
//         }
//       });
      
//     } catch (paystackError) {
//       // If Paystack fails, refund the user's wallet
//       user.walletBalance += amount;
//       await user.save();
      
//       transaction.status = 'failed';
//       transaction.details.errorMessage = paystackError.response ? 
//         paystackError.response.data.message : paystackError.message;
//       await transaction.save();
      
//       console.error('Paystack Transfer Error:', paystackError.response ? 
//         paystackError.response.data : paystackError.message);
      
//       res.status(400).json({
//         success: false,
//         message: 'Withdrawal failed. Your wallet has been refunded.',
//         walletBalance: user.walletBalance
//       });
//     }
    
//   } catch (error) {
//     console.error('Withdrawal Error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'An unexpected error occurred during withdrawal'
//     });
//   }
// });


exports.initiateWithdrawal = asyncHandler(async (req, res) => {
  try {
    const { 
      amount, 
      pin, 
      accountNumber, 
      bankCode, 
      bankName, 
      accountName 
    } = req.body;
    
    // Check user authentication
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'User authentication failed' });
    }
    
    const userId = req.user._id || req.user.id;
    
    // Validate required fields
    if (!amount || !accountNumber || !bankCode || !bankName || !accountName) {
      return res.status(400).json({ 
        message: 'All fields are required: amount, account number, bank code, bank name, and account name' 
      });
    }
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Please provide a valid amount' });
    }
    
    // Minimum withdrawal amount
    if (amount < 100) {
      return res.status(400).json({ 
        message: 'Minimum withdrawal amount is ₦100' 
      });
    }
    
    // Validate PIN
    const pinVerification = await verifyUserPin(userId, pin);
    if (!pinVerification.success) {
      return res.status(401).json({ message: pinVerification.message });
    }
    
    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check wallet balance
    if (user.walletBalance < amount) {
      return res.status(400).json({ 
        message: 'Insufficient wallet balance',
        walletBalance: user.walletBalance,
        requestedAmount: amount
      });
    }
    
    // Generate reference
    const reference = 'CHESS_WD_' + crypto.randomBytes(8).toString('hex');
    
    // Create transaction record
    const transaction = await Transaction.create({
      user: userId,
      type: 'withdrawal',
      amount,
      reference,
      status: 'pending', // Changed from 'processing' to 'pending'
      paymentMethod: 'bank_transfer',
      details: {
        bankName,
        bankCode,
        accountNumber,
        accountName,
        requestedAt: new Date()
      }
    });
    
    // Deduct amount from user's wallet
    user.walletBalance -= amount;
    await user.save();
    
    try {
      // Create transfer recipient in Paystack
      const recipientResponse = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: accountName,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN'
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const recipientCode = recipientResponse.data.data.recipient_code;
      
      // Initiate transfer
      const transferResponse = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: amount * 100, // Convert to kobo
          recipient: recipientCode,
          reason: 'Wallet withdrawal',
          reference: reference
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const transferData = transferResponse.data.data;
      
      // Check if OTP is required
      if (transferData.status === 'otp') {
        // OTP required - don't mark as completed yet
        transaction.status = 'pending';
        transaction.details.recipientCode = recipientCode;
        transaction.details.transferCode = transferData.transfer_code;
        transaction.details.requiresOtp = true;
        await transaction.save();
        
        console.log(`Transfer initiated, OTP required: ₦${amount} to ${accountName} - Reference: ${reference}`);
        
        return res.status(200).json({
          success: true,
          message: 'Transfer initiated. Please check your email/SMS for OTP verification.',
          requiresOtp: true,
          data: {
            amount,
            newBalance: user.walletBalance,
            reference,
            transferCode: transferData.transfer_code,
            accountName,
            bankName,
            status: 'pending_otp'
          }
        });
      }
      
      // If no OTP required, mark as completed
      transaction.status = 'completed';
      transaction.details.recipientCode = recipientCode;
      transaction.details.transferCode = transferData.transfer_code;
      await transaction.save();
      
      console.log(`Withdrawal successful: ₦${amount} to ${accountName} - Reference: ${reference}`);
      
      res.status(200).json({
        success: true,
        message: 'Withdrawal successful! Money has been sent to your bank account.',
        data: {
          amount,
          newBalance: user.walletBalance,
          reference,
          accountName,
          bankName,
          status: 'completed'
        }
      });
      
    } catch (paystackError) {
      // If Paystack fails, refund the user's wallet
      user.walletBalance += amount;
      await user.save();
      
      transaction.status = 'failed';
      transaction.details.errorMessage = paystackError.response ? 
        paystackError.response.data.message : paystackError.message;
      await transaction.save();
      
      console.error('Paystack Transfer Error:', paystackError.response ? 
        paystackError.response.data : paystackError.message);
      
      res.status(400).json({
        success: false,
        message: 'Withdrawal failed. Your wallet has been refunded.',
        walletBalance: user.walletBalance
      });
    }
    
  } catch (error) {
    console.error('Withdrawal Error:', error);
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during withdrawal'
    });
  }
});

// Add a new endpoint to finalize transfer with OTP
exports.finalizeTransferWithOtp = asyncHandler(async (req, res) => {
  try {
    const { transferCode, otp } = req.body;
    
    if (!transferCode || !otp) {
      return res.status(400).json({ 
        message: 'Transfer code and OTP are required' 
      });
    }
    
    // Find the transaction
    const transaction = await Transaction.findOne({
      'details.transferCode': transferCode,
      status: 'pending'
    });
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    // Finalize the transfer with OTP
    const finalizeResponse = await axios.post(
      'https://api.paystack.co/transfer/finalize_transfer',
      {
        transfer_code: transferCode,
        otp: otp
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (finalizeResponse.data.status) {
      // Update transaction as completed
      transaction.status = 'completed';
      await transaction.save();
      
      res.status(200).json({
        success: true,
        message: 'Transfer completed successfully!',
        data: {
          reference: transaction.reference,
          status: 'completed'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'OTP verification failed'
      });
    }
    
  } catch (error) {
    console.error('OTP Finalization Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to finalize transfer'
    });
  }
});

// @desc    Get all transaction history with pagination
// @route   GET /api/wallet/transactions
// @access  Private
exports.getTransactions = asyncHandler(async (req, res) => {
  // Fix: Check if user exists in different possible formats
  if (!req.user) {
    return res.status(401).json({ message: 'User authentication failed' });
  }
  
  const userId = req.user._id || req.user.id;
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
  // This function already works according to logs, but let's make it more robust
  const userId = (req.user && (req.user._id || req.user.id)) || 
                 (req.session && req.session.userId);
  
  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  const user = await User.findById(userId);
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Also get pending withdrawal amount
  const pendingWithdrawals = await Transaction.aggregate([
    {
      $match: {
        user: userId,
        type: 'withdrawal',
        status: 'pending'
      }
    },
    {
      $group: {
        _id: null,
        totalPending: { $sum: '$amount' }
      }
    }
  ]);
  
  const pendingAmount = pendingWithdrawals.length > 0 ? pendingWithdrawals[0].totalPending : 0;
  
  res.status(200).json({
    success: true,
    walletBalance: user.walletBalance,
    pendingWithdrawals: pendingAmount,
    availableBalance: user.walletBalance // Available balance is same as wallet balance since money isn't deducted until approval
  });
});


// @desc    Create recipient for bank transfer
// @route   POST /api/wallet/recipient
// @access  Private
exports.createRecipient = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User authentication failed' });
  }
  
  const userId = req.user._id || req.user.id;
  const user = await User.findById(userId);
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Ensure bank details are provided
  if (!user.bankDetails || !user.bankDetails.accountNumber || !user.bankDetails.bankName) {
    return res.status(400).json({ message: 'Please update your bank details first' });
  }
  
  try {
    // Create transfer recipient in Paystack
    const response = await axios.post(
      'https://api.paystack.co/transferrecipient',
      {
        type: 'nuban',
        name: user.bankDetails.accountName || user.fullName,
        account_number: user.bankDetails.accountNumber,
        bank_code: user.bankDetails.bankCode, // You need to get the bank code beforehand
        currency: 'NGN'
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Save recipient code to user
    user.paystackRecipientCode = response.data.data.recipient_code;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Bank account successfully linked for withdrawals',
      data: {
        accountName: response.data.data.details.account_name,
        bankName: user.bankDetails.bankName
      }
    });
  } catch (error) {
    console.error('Recipient Creation Error:', error.response ? error.response.data : error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to link bank account. Please check your bank details.'
    });
  }
});