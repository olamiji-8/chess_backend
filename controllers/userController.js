const User = require('../models/User');
const asyncHandler = require('express-async-handler');
const passport = require('passport');
const LichessStrategy = require('passport-lichess').Strategy;
const axios = require('axios');
const { getLichessClientId } = require('../config/lichessConfig');

// Configuration for Lichess OAuth
const LICHESS_API_URL = process.env.LICHESS_API_URL || 'https://lichess.org/api';
const LICHESS_REDIRECT_URI = process.env.LICHESS_REDIRECT_URI || 'http://localhost:5000/api/users/lichess-callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Get or generate a client ID
const LICHESS_CLIENT_ID = getLichessClientId();
console.log(`Using Lichess Client ID: ${LICHESS_CLIENT_ID}`);

// Configure Passport with Lichess Strategy
passport.use(new LichessStrategy({
    clientID: LICHESS_CLIENT_ID,
    callbackURL: LICHESS_REDIRECT_URI
  },
  async function(accessToken, refreshToken, profile, cb) {
    try {
      // Get user email from Lichess
      const emailResponse = await axios.get(`${LICHESS_API_URL}/account/email`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      const email = emailResponse.data.email;
      
      // Check if user exists in our database
      let user = await User.findOne({ email });
      
      if (!user) {
        // Create new user if not exists
        user = await User.create({
          fullName: profile.username,
          email,
          password: crypto.randomBytes(16).toString('hex'), // Secure random password
          lichessUsername: profile.username,
          isVerified: true, // Verified through Lichess
          profilePic: profile.profile?.picture || 'default-profile.jpg'
        });
      } else {
        // Update existing user with Lichess info
        user.lichessUsername = profile.username;
        user.isVerified = true;
        
        if (profile.profile?.picture) {
          user.profilePic = profile.profile.picture;
        }
        
        await user.save();
      }

      return cb(null, user, { accessToken });
    } catch (error) {
      console.error('Lichess OAuth Error:', error.response?.data || error.message);
      return cb(error);
    }
  }
));

// Serialize and deserialize user
passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// @desc    Initiate Lichess OAuth flow
// @route   GET /api/users/lichess-login
// @access  Public
exports.getLichessLoginUrl = (req, res, next) => {
  passport.authenticate('lichess')(req, res, next);
};

// @desc    Handle Lichess OAuth callback
// @route   GET /api/users/lichess-callback
// @access  Public
exports.handleLichessCallback = (req, res, next) => {
  passport.authenticate('lichess', { session: false }, (err, user, info) => {
    if (err) {
      console.error('Authentication error:', err);
      return res.status(500).json({
        success: false,
        message: 'Error authenticating with Lichess'
      });
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed'
      });
    }
    
    // Store user info in session
    req.session.userId = user._id;
    req.session.isLoggedIn = true;
    
    // Store lichess access token for future API calls
    req.session.lichessAccessToken = info.accessToken;
    
    // Redirect to frontend
    res.redirect(`${FRONTEND_URL}/dashboard`);
  })(req, res, next);
};

// @desc    Logout user
// @route   GET /api/users/logout
// @access  Public
exports.logoutUser = asyncHandler(async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Could not log out, please try again' });
    }
    res.clearCookie('connect.sid'); // Clear the session cookie
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  });
});

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
exports.getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.session.userId)
    .populate('registeredTournaments', 'title startDate status')
    .populate('createdTournaments', 'title startDate status');
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      profilePic: user.profilePic,
      phoneNumber: user.phoneNumber,
      lichessUsername: user.lichessUsername,
      isVerified: user.isVerified,
      walletBalance: user.walletBalance,
      bankDetails: user.bankDetails,
      registeredTournaments: user.registeredTournaments,
      createdTournaments: user.createdTournaments
    }
  });
});