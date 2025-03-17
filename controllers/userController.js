// const User = require('../models/User');
// const asyncHandler = require('express-async-handler');
// const passport = require('passport');
// const axios = require('axios');
// const crypto = require('crypto');

// const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// // @desc    Register a new user
// // @route   POST /api/users/register
// // @access  Public
// exports.registerUser = asyncHandler(async (req, res) => {
//   const { fullName, email, password } = req.body;

//   // Check if user already exists
//   const userExists = await User.findOne({ email });

//   if (userExists) {
//     res.status(400);
//     throw new Error('User already exists');
//   }

//   // Create new user
//   const user = await User.create({
//     fullName,
//     email,
//     password
//   });

//   if (user) {
//     // Set session
//     req.session.userId = user._id;
//     req.session.isLoggedIn = true;

//     // Save session explicitly
//     req.session.save((err) => {
//       if (err) {
//         console.error('Session save error:', err);
//       }
      
//       res.status(201).json({
//         success: true,
//         data: {
//           id: user._id,
//           fullName: user.fullName,
//           email: user.email,
//           isVerified: user.isVerified
//         }
//       });
//     });
//   } else {
//     res.status(400);
//     throw new Error('Invalid user data');
//   }
// });

// // @desc    Login user
// // @route   POST /api/users/login
// // @access  Public
// exports.loginUser = asyncHandler(async (req, res) => {
//   const { email, password } = req.body;

//   // Find user by email
//   const user = await User.findOne({ email }).select('+password');

//   if (!user || !(await user.matchPassword(password))) {
//     res.status(401);
//     throw new Error('Invalid email or password');
//   }

//   // Set session
//   req.session.userId = user._id;
//   req.session.isLoggedIn = true;

//   // Save session explicitly
//   req.session.save((err) => {
//     if (err) {
//       console.error('Session save error:', err);
//     }
    
//     res.status(200).json({
//       success: true,
//       data: {
//         id: user._id,
//         fullName: user.fullName,
//         email: user.email,
//         isVerified: user.isVerified
//       }
//     });
//   });
// });

// // @desc    Initiate Lichess OAuth flow
// // @route   GET /api/users/lichess-login
// // @access  Public
// exports.getLichessLoginUrl = (req, res, next) => {
//   console.log('Initiating Lichess login');
//   passport.authenticate('lichess')(req, res, next);
// };

// // @desc    Handle Lichess OAuth callback
// // @route   GET /api/users/lichess-callback
// // @access  Public
// exports.handleLichessCallback = (req, res, next) => {
//   console.log('Received Lichess callback');
  
//   passport.authenticate('lichess', { session: false }, (err, user, info) => {
//     if (err) {
//       console.error('Authentication error:', err);
//       return res.redirect(`${FRONTEND_URL}/login?error=auth_error&message=${encodeURIComponent(err.message)}`);
//     }
    
//     if (!user) {
//       console.error('No user returned from authentication');
//       return res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
//     }
    
//     // Set session data directly (simpler approach than mixing with Passport session)
//     req.session.userId = user._id;
//     req.session.isLoggedIn = true;
//     req.session.lichessAccessToken = info.accessToken;
//     req.session.lichessUsername = user.lichessUsername;
    
//     // Save session explicitly before redirect
//     req.session.save((saveErr) => {
//       if (saveErr) {
//         console.error('Session save error:', saveErr);
//         return res.redirect(`${FRONTEND_URL}/login?error=session_error`);
//       }
      
//       console.log('Session created:', req.sessionID);
//       console.log('Session data:', {
//         userId: req.session.userId,
//         isLoggedIn: req.session.isLoggedIn,
//         lichessUsername: req.session.lichessUsername
//       });
      
//       // Redirect to frontend with success indicator
//       res.redirect(`${FRONTEND_URL}?login=success&username=${encodeURIComponent(user.lichessUsername)}`);
//     });
//   })(req, res, next);
// };

// // @desc    Logout user
// // @route   GET /api/users/logout
// // @access  Public
// exports.logoutUser = asyncHandler(async (req, res) => {
//   req.logout(function(err) {
//     if (err) {
//       return res.status(500).json({ message: 'Error during logout', error: err.message });
//     }
    
//     req.session.destroy((err) => {
//       if (err) {
//         return res.status(500).json({ message: 'Could not log out, please try again' });
//       }
//       res.clearCookie('connect.sid'); // Clear the session cookie
//       res.status(200).json({ success: true, message: 'Logged out successfully' });
//     });
//   });
// });


// // @desc    Get current user profile
// // @route   GET /api/users/profile
// // @access  Private
// exports.getUserProfile = asyncHandler(async (req, res) => {
//   const user = await User.findById(req.session.userId)
//     .populate('registeredTournaments', 'title startDate status')
//     .populate('createdTournaments', 'title startDate status');
  
//   if (!user) {
//     return res.status(404).json({ message: 'User not found' });
//   }
  
//   res.status(200).json({
//     success: true,
//     data: {
//       id: user._id,
//       fullName: user.fullName,
//       email: user.email,
//       profilePic: user.profilePic,
//       phoneNumber: user.phoneNumber,
//       lichessUsername: user.lichessUsername,
//       isVerified: user.isVerified,
//       walletBalance: user.walletBalance,
//       bankDetails: user.bankDetails,
//       registeredTournaments: user.registeredTournaments,
//       createdTournaments: user.createdTournaments
//     }
//   });
// });

// // @desc    Update user profile
// // @route   PUT /api/users/profile
// // @access  Private
// exports.updateUserProfile = asyncHandler(async (req, res) => {
//   const user = await User.findById(req.session.userId);
  
//   if (!user) {
//     return res.status(404).json({ message: 'User not found' });
//   }
  
//   // Update user fields
//   user.fullName = req.body.fullName || user.fullName;
//   user.email = req.body.email || user.email;
//   user.phoneNumber = req.body.phoneNumber || user.phoneNumber;
  
//   if (req.body.password) {
//     user.password = req.body.password;
//   }
  
//   if (req.file) {
//     user.profilePic = req.file.filename;
//   }
  
//   // Update bank details if provided
//   if (req.body.bankDetails) {
//     user.bankDetails = {
//       ...user.bankDetails,
//       ...req.body.bankDetails
//     };
//   }
  
//   const updatedUser = await user.save();
  
//   res.status(200).json({
//     success: true,
//     data: {
//       id: updatedUser._id,
//       fullName: updatedUser.fullName,
//       email: updatedUser.email,
//       profilePic: updatedUser.profilePic,
//       phoneNumber: updatedUser.phoneNumber,
//       lichessUsername: updatedUser.lichessUsername,
//       isVerified: updatedUser.isVerified,
//       walletBalance: updatedUser.walletBalance,
//       bankDetails: updatedUser.bankDetails
//     }
//   });
// });

// // @desc    Verify user account
// // @route   POST /api/users/verify
// // @access  Private
// exports.verifyUser = asyncHandler(async (req, res) => {
//   const user = await User.findById(req.session.userId);
  
//   if (!user) {
//     return res.status(404).json({ message: 'User not found' });
//   }
  
//   // Implement your verification logic here
//   // This could be email verification, document verification, etc.
  
//   user.isVerified = true;
//   await user.save();
  
//   res.status(200).json({
//     success: true,
//     message: 'Account verified successfully',
//     data: {
//       isVerified: true
//     }
//   });
// });


// // @desc    Initiate Lichess login
// exports.getLichessLoginUrl = passport.authenticate('lichess');

// // @desc    Handle Lichess callback
// exports.handleLichessCallback = (req, res, next) => {
//   passport.authenticate('lichess', { session: false }, (err, user, info) => {
//     if (err || !user) {
//       return res.redirect(`${FRONTEND_URL}/login?error=true`);
//     }

//     // Set your own session
//     req.session.userId = user._id;
//     req.session.isLoggedIn = true;
//     req.session.lichessAccessToken = info.accessToken;
//     req.session.lichessUsername = user.lichessUsername;

//     req.session.save((saveErr) => {
//       if (saveErr) {
//         return res.redirect(`${FRONTEND_URL}/login?error=session`);
//       }

//       return res.redirect(`${FRONTEND_URL}`); 
//     });
//   })(req, res, next);
// };


const axios = require('axios');
const User = require('../models/User');
const generatePKCE = require('../server/utils/pkce');

let codeVerifier = '';

const CLIENT_ID = process.env.LICHESS_CLIENT_ID;
const REDIRECT_URI = process.env.LICHESS_REDIRECT_URI;

exports.loginWithLichess = (req, res) => {
  const pkce = generatePKCE();
  codeVerifier = pkce.codeVerifier;

  const authUrl = `https://lichess.org/oauth?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&code_challenge_method=S256&code_challenge=${pkce.codeChallenge}&scope=preference:read`;

  console.log('Redirecting to:', authUrl); // helpful for debugging

  res.redirect(authUrl);
};

exports.handleCallback = async (req, res) => {
  const { code } = req.query;

  try {
    // Exchange code for access token
    const response = await axios.post('https://lichess.org/api/token', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const accessToken = response.data.access_token;

    // Get user profile
    const userRes = await axios.get('https://lichess.org/api/account', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const { username } = userRes.data;

    // Save to DB
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({ username, accessToken });
    } else {
      user.accessToken = accessToken;
    }
    await user.save();

    res.json({ message: 'Login successful', username });
  } catch (err) {
    console.error(err);
    res.status(500).send('Login failed');
  }
};
