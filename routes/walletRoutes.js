const express = require('express');
const router = express.Router();
const { 
  initiateDeposit, 
  verifyDeposit, 
  initiateWithdrawal,
  getTransactions
} = require('../controllers/walletController');
const { protect } = require('../middleware/authMiddleware');

router.post('/deposit', protect, initiateDeposit);
router.get('/verify/:reference', verifyDeposit);
router.post('/withdraw', protect, initiateWithdrawal);
router.get('/transactions', protect, getTransactions);

module.exports = router;