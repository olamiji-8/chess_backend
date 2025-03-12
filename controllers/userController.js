const User = require('../models/User');
const asyncHandler = require('express-async-handler');
const axios = require('axios');


const LICHESS_AUTH_URL = process.env.LICHESS_AUTH_URL;
const LICHESS_TOKEN_URL = process.env.LICHESS_TOKEN_URL;
const LICHESS_API_URL = process.env.LICHESS_API_URL;
const LICHESS_CLIENT_ID = process.env.LICHESS_CLIENT_ID;
const LICHESS_CLIENT_SECRET = process.env.LICHESS_CLIENT_SECRET;
const LICHESS_REDIRECT_URI = process.env.LICHESS_REDIRECT_URI;


// @desc    Get Lichess OAuth login URL
// @route   GET /api/users/lichess-login
// @access  Public
exports.getLichessLoginUrl = asyncHandler(async (req, res) => {
  const state = Math.random().toString(36).substring(2, 15);
  
  // Store state in session to verify on callback
  req.session.lichessState = state;
  
  const authUrl = `${LICHESS_AUTH_URL}?response_type=code&client_id=${LICHESS_CLIENT_ID}&redirect_uri=${LICHESS_REDIRECT_URI}&state=${state}&scope=email:read`;
  
  res.status(200).json({
    success: true,
    authUrl
  });
});

// @desc    Handle Lichess OAuth callback
// @route   GET /api/users/lichess-callback
// @access  Public
exports.handleLichessCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state to prevent CSRF attacks
  if (state !== req.session.lichessState) {
    return res.status(400).json({ message: 'Invalid state parameter' });
  }
  
  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(LICHESS_TOKEN_URL, 
      `grant_type=authorization_code&code=${code}&redirect_uri=${LICHESS_REDIRECT_URI}&client_id=${LICHESS_CLIENT_ID}&client_secret=${LICHESS_CLIENT_SECRET}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const accessToken = tokenResponse.data.access_token;
    
    // Get user info from Lichess
    const userResponse = await axios.get(`${LICHESS_API_URL}/account`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const lichessUser = userResponse.data;
    
    // Get user email
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
        fullName: lichessUser.username,
        email,
        password: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        lichessUsername: lichessUser.username,
        isVerified: true, // We can consider them verified since they have a Lichess account
        profilePic: lichessUser.profile?.picture || 'default-profile.jpg'
      });
    } else {
      // Update existing user with Lichess info
      user.lichessUsername = lichessUser.username;
      user.isVerified = true;
      
      if (lichessUser.profile?.picture) {
        user.profilePic = lichessUser.profile.picture;
      }
      
      await user.save();
    }
    
    // Store user info in session
    req.session.userId = user._id;
    req.session.isLoggedIn = true;
    
    // Store lichess access token for future API calls
    req.session.lichessAccessToken = accessToken;
    
    // Redirect to frontend
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    
  } catch (error) {
    console.error('Lichess OAuth Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Error authenticating with Lichess'
    });
  }
});

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