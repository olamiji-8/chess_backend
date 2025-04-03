const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const multer = require('multer');

// Fix the handleUploadError middleware
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  } else if (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'File upload failed'
    });
  }
  next();
};


// Public routes
router.post('/register', userController.registerUser);
router.post('/sigin', userController.loginUser);
router.get('/logout', userController.logoutUser);
router.get('/login', userController.loginWithLichess);
router.get('/callback', userController.handleCallback);

// Protected routes (require authentication)
router.get('/profile', protect, userController.getUserProfile);
router.put('/profile', protect, upload.single('profilePic'), userController.updateUserProfile);

// PIN management
router.post('/pin', protect, userController.updatePin);
router.post('/verify-pin', protect, userController.verifyPin);
router.get('/check-pin-status', protect, userController.checkPinStatus);

// Verification routes
router.post('/verification/submit', 
  protect,
  (req, res, next) => {
    const uploadFields = upload.fields([
      { name: 'idCard', maxCount: 1 },
      { name: 'selfie', maxCount: 1 }
    ]);
    
    uploadFields(req, res, function(err) {
      if (err) {
        return handleUploadError(err, req, res, next);
      }
      next();
    });
  },
  userController.submitVerificationRequest
);


router.get('/verification/status', protect, userController.getVerificationStatus);

// Banks
router.get('/banks', protect, userController.getBanks);
router.post('/verify-account', protect, userController.verifyBankAccount);

module.exports = router;

