const express = require('express');
const router = express.Router();
const { 
  submitVerificationRequest, 
  getVerificationStatus 
} = require('../controllers/verificationController');
const { protect } = require('../middleware/authMiddleware');
const uploadMultiple = require('../middleware/uploadMiddleware');

// Setup upload fields for multiple files
const uploadFields = uploadMultiple.fields([
  { name: 'idCard', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]);

// User verification routes
router.post('/submit', protect, uploadFields, submitVerificationRequest);
router.get('/status', protect, getVerificationStatus);

module.exports = router;