const express = require('express');
const router = express.Router();
const { 
  registerUser, 
  loginUser, 
  logoutUser,
  getUserProfile, 
  updateUserProfile,
  verifyUser,
  getLichessLoginUrl,
  handleLichessCallback,
  loginWithLichess, 
  handleCallback
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Regular auth routes (uncomment as needed)
// router.post('/register', registerUser);
// router.post('/login', loginUser);
// router.get('/logout', logoutUser);
// router.get('/profile', protect, getUserProfile);
// router.put('/profile', protect, upload.single('profilePic'), updateUserProfile);
// router.post('/verify', protect, verifyUser);

// Lichess OAuth routes
// router.get('/lichess-login', getLichessLoginUrl);
// router.get('/lichess-callback', handleLichessCallback);


router.get('/login', loginWithLichess);
router.get('/callback', handleCallback);

module.exports = router;