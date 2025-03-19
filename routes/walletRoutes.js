const express = require('express');
const router = express.Router();
const { 
  initiateDeposit, 
  verifyDeposit, 
  initiateWithdrawal,
  getTransactions,
  getWalletBalance,
  verifyPin
} = require('../controllers/walletController');
const { protect } = require('../middleware/authMiddleware');

// Wallet routes
router.post('/deposit', protect, initiateDeposit);
router.get('/verify/:reference', verifyDeposit);
router.post('/withdraw', protect, initiateWithdrawal);
router.get('/transactions', protect, getTransactions);
router.get('/balance', protect, getWalletBalance);
router.post('/verify-pin', protect, verifyPin);

module.exports = router;