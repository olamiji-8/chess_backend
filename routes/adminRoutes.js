const express = require('express');
const router = express.Router();
const { 
  getAllVerificationRequests, 
  updateVerificationStatus 
} = require('../controllers/verificationController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.route('/verifications')
  .get(protect, adminOnly, getAllVerificationRequests);

router.route('/verifications/:id')
  .put(protect, adminOnly, updateVerificationStatus);

module.exports = router;