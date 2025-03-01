const express = require('express');
const router = express.Router();
const { 
  getAllVerificationRequests, 
  updateVerificationStatus 
} = require('../controllers/verificationController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/verifications')
  .get(protect, admin, getAllVerificationRequests);

router.route('/verifications/:id')
  .put(protect, admin, updateVerificationStatus);

module.exports = router;