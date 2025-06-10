const User = require('../models/User');
const VerificationRequest = require('../models/verification');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const crypto = require('crypto');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const generatePKCE = require('../server/utils/pkce');
const { verifyUserPin } = require('../utils/pinVerification');
const jwt = require('jsonwebtoken');
const { notifyUserWelcome } = require('../controllers/notificationController');

const CLIENT_ID = process.env.LICHESS_CLIENT_ID;
const REDIRECT_URI = process.env.LICHESS_REDIRECT_URI || 'http://localhost:5000/api/users/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';
const TOKEN_EXPIRY = '7d'; // Token expires in 7 days



// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
// exports.registerUser = asyncHandler(async (req, res) => {
//   const { fullName, email, password } = req.body;

//   // Check if user already exists
//   const userExists = await User.findOne({ email });

//   if (userExists) {
//     res.status(400);
//     throw new Error('User already exists');
//   }

//   // Generate default PIN for registration
//   const defaultPin = Math.floor(1000 + Math.random() * 9000).toString();
//   const salt = await bcrypt.genSalt(10);
//   const hashedPin = await bcrypt.hash(defaultPin, salt);

//   // Create new user
//   const user = await User.create({
//     fullName,
//     email,
//     password,
//     pin: hashedPin // Store the hashed default PIN
//   });

//   if (user) {
//     // Generate JWT token
//     const token = generateToken(user._id);
    
//     res.status(201).json({
//       success: true,
//       data: {
//         id: user._id,
//         fullName: user.fullName,
//         email: user.email,
//         isVerified: user.isVerified,
//         token
//       },
//       message: 'Registration successful. Please set your PIN for transactions.'
//     });
//   } else {
//     res.status(400);
//     throw new Error('Invalid user data');
//   }
// });

/**    
 * @desc    Create a new admin user
 * @route   POST /api/admin/create-admin
 * @access  Admin only
 */
exports.createAdmin = asyncHandler(async (req, res) => {
  const { fullName, email, password, phoneNumber } = req.body;

  // Validate required fields
  if (!fullName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide all required fields'
    });
  }

  try {
    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create new admin user
    const admin = await User.create({
      fullName,
      email,
      password, // Password will be hashed via pre-save hook
      phoneNumber: phoneNumber || '',
      role: 'admin',
      isVerified: true // Auto-verify admin accounts
    });

    // Create token for immediate login
    const token = jwt.sign(
      { id: admin._id },
      process.env.JWT_SECRET || 'fallbacksecret', // Add fallback for testing
      { expiresIn: '30d' }
    );

    // Return success response without password
    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      data: {
        _id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        isVerified: admin.isVerified,
        token: token
      }
    });
  } catch (error) {
    console.error('Error creating admin user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create admin user',
      error: error.message
    });
  }
});


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

//   // Generate JWT token
//   const token = generateToken(user._id);
  
//   res.status(200).json({
//     success: true,
//     data: {
//       id: user._id,
//       fullName: user.fullName,
//       email: user.email,
//       isVerified: user.isVerified,
//       lichessUsername: user.lichessUsername,
//       token
//     }
//   });
// });

// @desc    Logout user
// @route   GET /api/users/logout
// @access  Private
exports.logoutUser = asyncHandler(async (req, res) => {
  // With JWT, logout happens client-side by removing the token
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, SECRET_KEY, { expiresIn: TOKEN_EXPIRY });
};

// Redirect to Lichess OAuth with PKCE
exports.loginWithLichess = (req, res) => {
  const pkce = generatePKCE();
  
  // Store code verifier in a cookie (signed for security)
  res.cookie('codeVerifier', pkce.codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    signed: true,
    maxAge: 10 * 60 * 1000 // 10 minutes
  });
  
  // 🔥 FIXED: Added email:read scope to access user's email
  const authUrl = `https://lichess.org/oauth?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&code_challenge_method=S256&code_challenge=${pkce.codeChallenge}&scope=preference:read email:read`;

  console.log('Redirecting to:', authUrl);
  res.redirect(authUrl);
};

exports.handleCallback = async (req, res) => {
  try {
    const { code } = req.query;
    const codeVerifier = req.signedCookies?.codeVerifier;

    if (!code || !codeVerifier) {
      console.error("❌ Code verifier missing or cookie expired!");
      return res.redirect(`${FRONTEND_URL}/onboarding?error=missing_code_verifier`);
    }

    // Exchange the code for an access token
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("client_id", CLIENT_ID);
    params.append("redirect_uri", REDIRECT_URI);
    params.append("code_verifier", codeVerifier);

    const tokenResponse = await axios.post("https://lichess.org/api/token", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000 // Increased timeout
    });

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      throw new Error("Lichess authentication failed: No access token received.");
    }

    // Fetch user details from Lichess
    const userRes = await axios.get("https://lichess.org/api/account", {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });

    const lichessUserData = userRes.data;
    console.log(`📊 Lichess user data received:`, {
      username: lichessUserData.username,
      hasEmailInProfile: !!lichessUserData.email
    });

    const { username } = lichessUserData;
    let userEmail = null;
    let emailFromDedicatedEndpoint = false;

    // 🔥 IMPROVED: Enhanced email fetching with proper error handling
    try {
      console.log(`📧 Attempting to fetch email from dedicated endpoint with email:read scope...`);
      const emailRes = await axios.get("https://lichess.org/api/account/email", {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'Your-App-Name/1.0' // Good practice to identify your app
        },
        timeout: 10000
      });

      console.log(`📧 Email endpoint response:`, emailRes.data);

      if (emailRes.data && emailRes.data.email) {
        userEmail = emailRes.data.email;
        emailFromDedicatedEndpoint = true;
        console.log(`✅ Email successfully retrieved from dedicated endpoint: ${userEmail}`);
      } else {
        console.log(`⚠️ Email endpoint returned empty or invalid response:`, emailRes.data);
      }
    } catch (emailError) {
      console.log(`⚠️ Could not fetch email from dedicated endpoint:`, {
        status: emailError.response?.status,
        statusText: emailError.response?.statusText,
        data: emailError.response?.data,
        message: emailError.message
      });
      
      // 🔥 ADDED: Specific error handling for common issues
      if (emailError.response?.status === 401) {
        console.error(`❌ CRITICAL: Unauthorized access to email endpoint. Check if email:read scope is properly granted.`);
      } else if (emailError.response?.status === 403) {
        console.error(`❌ CRITICAL: Forbidden access to email endpoint. User may not have email visibility enabled.`);
      }
    }

    // Fallback to profile email if dedicated endpoint failed
    if (!userEmail && lichessUserData.email) {
      userEmail = lichessUserData.email;
      console.log(`📧 Using email from profile: ${userEmail}`);
    }

    // 🔥 IMPROVED: Better handling of missing email
    if (!userEmail) {
      console.log(`❌ No email available from any source. This will cause issues with wallet functionality.`);
      
      // Option 1: Redirect to profile completion page
      return res.redirect(`${FRONTEND_URL}/complete-profile?error=no_email&username=${username}`);
      
      // Option 2: Use temporary email but flag the account (uncomment if you prefer this approach)
      /*
      userEmail = `${username}@lichess.temp`;
      console.log(`📧 Using temporary email: ${userEmail}`);
      */
    }

    console.log(`📧 Final email decision:`, {
      email: userEmail,
      source: emailFromDedicatedEndpoint ? 'dedicated_endpoint' : 
              lichessUserData.email ? 'profile' : 'temporary',
      isVerified: emailFromDedicatedEndpoint || !!lichessUserData.email
    });

    // Check if this is a new user
    const existingUser = await User.findOne({
      $or: [
        { lichessUsername: username },
        { email: userEmail },
      ],
    });

    const isNewUser = !existingUser;
    console.log(`👤 User status: ${isNewUser ? 'NEW USER' : 'EXISTING USER'}`);

    // 🔥 IMPROVED: Enhanced user creation/update logic
    const user = await User.findOneAndUpdate(
      {
        $or: [
          { lichessUsername: username },
          { email: userEmail },
        ],
      },
      {
        $setOnInsert: {
          fullName: username,
          email: userEmail,
          password: await bcrypt.hash(crypto.randomBytes(20).toString("hex"), 10),
          isVerified: emailFromDedicatedEndpoint || !!lichessUserData.email,
          isFirstLogin: true,
          emailSource: emailFromDedicatedEndpoint ? 'lichess_api' : 
                      lichessUserData.email ? 'lichess_profile' : 'temporary'
        },
        $set: {
          lichessUsername: username,
          lichessAccessToken: accessToken,
          // 🔥 IMPROVED: Only update email if we got a real one
          ...(userEmail && userEmail !== `${username}@lichess.temp` && { 
            email: userEmail, 
            isVerified: emailFromDedicatedEndpoint || !!lichessUserData.email,
            emailSource: emailFromDedicatedEndpoint ? 'lichess_api' : 'lichess_profile'
          })
        }
      },
      { upsert: true, new: true }
    );

    console.log(`💾 User saved:`, {
      id: user._id,
      email: user.email,
      lichessUsername: user.lichessUsername,
      isVerified: user.isVerified,
      emailSource: user.emailSource
    });

    // 🔥 IMPROVED: Only send welcome notification if we have a real email
    if ((isNewUser || user.isFirstLogin) && user.email && !user.email.includes('@lichess.temp')) {
      try {
        console.log(`🚀 Triggering welcome notification for user: ${user._id}`);
        
        const welcomeResult = await notifyUserWelcome(user._id);
        console.log(`📨 Welcome notification result:`, welcomeResult);
        
        if (user.isFirstLogin) {
          await User.findByIdAndUpdate(user._id, { isFirstLogin: false });
          console.log(`✅ Updated isFirstLogin flag for user: ${user._id}`);
        }
      } catch (error) {
        console.error('❌ Failed to send welcome notification:', error);
      }
    } else {
      console.log(`ℹ️ Skipping welcome notification - ${!user.email ? 'no email' : 'temp email or returning user'}`);
    }

    // Clear the code verifier cookie
    res.clearCookie('codeVerifier');

    // Generate JWT token
    const token = generateToken(user._id);

    // 🔥 IMPROVED: Handle users with temporary emails
    if (user.email && user.email.includes('@lichess.temp')) {
      return res.redirect(`${FRONTEND_URL}/complete-profile?token=${token}&needs_email=true`);
    }

    // Redirect to frontend with JWT token
    return res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
    
  } catch (error) {
    console.error("❌ Lichess Authentication Error:", {
      message: error.message,
      response: error.response?.data,
      stack: error.stack,
    });

    return res.redirect(`${FRONTEND_URL}/login?error=auth_failed&message=${encodeURIComponent(error.message)}`);
  }
};


exports.getUserProfile = asyncHandler(async (req, res) => {
  // Use req.user which is set by the JWT authentication middleware
  const user = await User.findById(req.user._id)
    .populate('registeredTournaments', 'title startDate status')
    .populate('createdTournaments', 'title startDate status');
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Extract bankCode from bankDetails if it exists
  const bankCode = user.bankDetails?.bankCode || null;
  
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
      bankCode: bankCode, // Added bankCode explicitly
      registeredTournaments: user.registeredTournaments,
      createdTournaments: user.createdTournaments,
      hasPin: user.hasPin,
    }
  });
});

// @desc    Get banks from Paystack
// @route   GET /api/users/banks
// @access  Private
exports.getBanks = asyncHandler(async (req, res) => {
  try {
    const response = await axios.get('https://api.paystack.co/bank', {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    });
    
    res.status(200).json({
      success: true,
      data: response.data.data
    });
  } catch (error) {
    console.error('Paystack API error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Unable to fetch banks from payment provider'
    });
  }
});

// @desc    Verify bank account
// @route   POST /api/users/verify-account
// @access  Private
exports.verifyBankAccount = asyncHandler(async (req, res) => {
  const { accountNumber, bankCode } = req.body;
  
  if (!accountNumber || !bankCode) {
    return res.status(400).json({ 
      success: false,
      message: 'Account number and bank code are required' 
    });
  }
  
  try {
    const response = await axios.get(`https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    });
    
    res.status(200).json({
      success: true,
      data: {
        accountName: response.data.data.account_name,
        accountNumber: response.data.data.account_number,
        bankCode: bankCode
      }
    });
  } catch (error) {
    console.error('Account verification error:', error.response?.data || error.message);
    res.status(400).json({
      success: false,
      message: 'Unable to verify account. Please check the details and try again.'
    });
  }
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateUserProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId);
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Debug logging
  console.log('=== DEBUG UPDATE PROFILE ===');
  console.log('Request body:', req.body);
  console.log('Request file:', req.file);
  console.log('Current user data:', {
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber
  });
  
  // Update user fields - allow empty strings but check for undefined
  if (req.body.fullName !== undefined) {
    console.log('Updating fullName from:', user.fullName, 'to:', req.body.fullName);
    user.fullName = req.body.fullName;
  }
  
  if (req.body.email !== undefined) {
    // Validate email format if provided
    if (req.body.email && !/\S+@\S+\.\S+/.test(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }
    console.log('Updating email from:', user.email, 'to:', req.body.email);
    user.email = req.body.email;
  }
  
  if (req.body.phoneNumber !== undefined) {
    console.log('Updating phoneNumber from:', user.phoneNumber, 'to:', req.body.phoneNumber);
    user.phoneNumber = req.body.phoneNumber;
  }
  
  // Handle password update with proper hashing
  if (req.body.password) {
    // Assuming you're using bcrypt for password hashing
    const bcrypt = require('bcrypt');
    const saltRounds = 10;
    user.password = await bcrypt.hash(req.body.password, saltRounds);
  }
  
  // Handle profile image update
  if (req.file) {
    // Case 1: File upload handling
    try {
      // Delete previous profile image from Cloudinary if it exists and isn't the default
      if (user.profilePic && user.profilePic !== 'default-profile.jpg' && user.profilePic.includes('cloudinary')) {
        // Extract public_id from the URL
        const publicId = user.profilePic.split('/').pop().split('.')[0];
        if (publicId) {
          await cloudinary.uploader.destroy(`profile_pics/${publicId}`);
        }
      }
      
      // Upload new profile pic to cloudinary
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: 'profile_pics',
        transformation: [
          { width: 500, height: 500, crop: "limit" },
          { quality: "auto" }
        ]
      });
      
      // Update user profile pic with new URL
      user.profilePic = uploadResult.secure_url;
      
      // Delete local file after upload
      fs.unlinkSync(req.file.path);
    } catch (error) {
      console.error('Error uploading profile pic:', error);
      return res.status(400).json({
        success: false,
        message: 'Error uploading profile image'
      });
    }
  } else if (req.body.profilePic !== undefined) {
    // Case 2: String URL or base64 handling
    if (req.body.profilePic === "null" || req.body.profilePic === "default" || req.body.profilePic === "") {
      // Delete current image if it's not default
      if (user.profilePic && user.profilePic !== 'default-profile.jpg' && user.profilePic.includes('cloudinary')) {
        try {
          const publicId = user.profilePic.split('/').pop().split('.')[0];
          if (publicId) {
            await cloudinary.uploader.destroy(`profile_pics/${publicId}`);
          }
        } catch (error) {
          console.error('Error deleting old profile pic:', error);
        }
      }
      // Reset to default profile pic
      user.profilePic = 'default-profile.jpg';
    } else if (req.body.profilePic.startsWith('http')) {
      // Direct URL assignment (e.g. from another service)
      user.profilePic = req.body.profilePic;
    } else if (req.body.profilePic.startsWith('data:image')) {
      // Handle base64 encoded image
      try {
        // Delete previous profile image if needed
        if (user.profilePic && user.profilePic !== 'default-profile.jpg' && user.profilePic.includes('cloudinary')) {
          const publicId = user.profilePic.split('/').pop().split('.')[0];
          if (publicId) {
            await cloudinary.uploader.destroy(`profile_pics/${publicId}`);
          }
        }
        
        // Upload base64 image to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(req.body.profilePic, {
          folder: 'profile_pics',
          transformation: [
            { width: 500, height: 500, crop: "limit" },
            { quality: "auto" }
          ]
        });
        
        user.profilePic = uploadResult.secure_url;
      } catch (error) {
        console.error('Error uploading base64 profile pic:', error);
        return res.status(400).json({
          success: false,
          message: 'Error processing profile image'
        });
      }
    }
  }
  
  // Handle bank details - check if we're updating or clearing
  console.log('Bank details in request:', req.body.bankDetails);
  
  // Check if bank details are provided in nested object format
  let bankAccountNumber, bankCode, bankAccountName;
  
  if (req.body.bankDetails && typeof req.body.bankDetails === 'object') {
    // Bank details sent as nested object
    bankAccountNumber = req.body.bankDetails.accountNumber;
    bankCode = req.body.bankDetails.bankCode;
    bankAccountName = req.body.bankDetails.accountName;
  } else {
    // Bank details sent as flat fields
    bankAccountNumber = req.body.accountNumber;
    bankCode = req.body.bankCode;
    bankAccountName = req.body.accountName;
  }
  
  console.log('Extracted bank details:', { bankAccountNumber, bankCode, bankAccountName });
  
  // Check if any bank field is provided
  const bankFieldsProvided = [bankAccountNumber, bankCode, bankAccountName].filter(field => field !== undefined);
  
  if (bankFieldsProvided.length > 0) {
    // If any bank field is provided, we need all of them (unless clearing)
    const allBankFieldsEmpty = [bankAccountNumber, bankCode, bankAccountName].every(field => !field || field.toString().trim() === '');
    
    if (allBankFieldsEmpty) {
      // Clear bank details
      console.log('Clearing bank details');
      user.bankDetails = undefined;
    } else if (bankAccountNumber && bankCode && bankAccountName) {
      // All required fields provided, validate and save
      try {
        console.log('Validating bank details with Paystack...');
        // Verify with Paystack before saving
        const bankResponse = await axios.get('https://api.paystack.co/bank', {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
          }
        });
        
        // Find bank name from bank code
        const bank = bankResponse.data.data.find(b => b.code === bankCode);
        
        if (!bank) {
          return res.status(400).json({ 
            success: false,
            message: 'Invalid bank code provided' 
          });
        }
        
        console.log('Bank validated:', bank.name);
        
        // Save bank details with bank name
        user.bankDetails = {
          accountNumber: bankAccountNumber.toString().trim(),
          accountName: bankAccountName.toString().trim(),
          bankCode: bankCode,
          bankName: bank.name,
          verified: true
        };
        
        console.log('Bank details updated:', user.bankDetails);
        
      } catch (error) {
        console.error('Error verifying bank:', error);
        // If verification fails, still save but mark as unverified
        user.bankDetails = {
          accountNumber: bankAccountNumber.toString().trim(),
          accountName: bankAccountName.toString().trim(),
          bankCode: bankCode,
          verified: false
        };
        console.log('Bank details saved without verification:', user.bankDetails);
      }
    } else {
      // Partial bank details provided
      return res.status(400).json({
        success: false,
        message: 'Bank details must include all fields: accountNumber, bankCode, and accountName, or leave all empty to clear'
      });
    }
  } else if (req.body.bankDetails !== undefined || req.body.accountNumber !== undefined) {
    // Bank details field was sent but is empty/null - clear existing bank details
    console.log('Clearing bank details (empty object sent)');
    user.bankDetails = undefined;
  }
  
  try {
    console.log('About to save user with data:', {
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber
    });
    
    const updatedUser = await user.save();
    
    console.log('User saved successfully:', {
      fullName: updatedUser.fullName,
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber
    });
    
    res.status(200).json({
      success: true,
      data: {
        id: updatedUser._id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        profilePic: updatedUser.profilePic,
        phoneNumber: updatedUser.phoneNumber,
        lichessUsername: updatedUser.lichessUsername,
        isVerified: updatedUser.isVerified,
        walletBalance: updatedUser.walletBalance,
        bankDetails: updatedUser.bankDetails
      },
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error saving user:', error);
    
    // Handle specific MongoDB validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }
    
    // Handle duplicate key errors (like email already exists)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
});

// @desc    Create or update PIN
// @route   POST /api/users/pin
// @access  Private
exports.updatePin = asyncHandler(async (req, res) => {
  const { currentPin, newPin, confirmPin } = req.body;
  const userId = req.user.id;

  const user = await User.findById(userId).select('+pin');

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ message: 'PIN must be exactly 4 digits' });
  }

  if (newPin !== confirmPin) {
    return res.status(400).json({ message: 'PINs do not match' });
  }

  if (user.pin) {
    if (!currentPin) {
      return res.status(400).json({ message: 'Current PIN is required' });
    }

    const pinVerification = await verifyUserPin(userId, currentPin);
    if (!pinVerification.success) {
      return res.status(401).json({ message: 'Current PIN is incorrect' });
    }
  } else {
    if (currentPin) {
      return res.status(400).json({ message: 'Current PIN should not be provided for first-time setup' });
    }
  }

  const salt = await bcrypt.genSalt(10);
  user.pin = await bcrypt.hash(newPin, salt);
  await user.save();

  res.status(200).json({
    success: true,
    message: 'PIN updated successfully'
  });
});

// @desc    Verify PIN
// @route   POST /api/users/verify-pin
// @access  Private
exports.verifyPin = asyncHandler(async (req, res) => {
  const { pin } = req.body;

  if (!pin) {
    return res.status(400).json({ success: false, message: "PIN is required" });
  }

  const user = await User.findById(req.user.id).select('+pin');
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const isMatch = await bcrypt.compare(pin, user.pin);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: "Invalid PIN" });
  }

  user.hasPin = true; // <-- This is what updates it
  await user.save();

  res.status(200).json({
    success: true,
    message: "PIN verified successfully",
    data: {
      hasPin: user.hasPin
    }
  });
});

exports.resetForgottenPin = asyncHandler(async (req, res) => {
  const { newPin, confirmPin } = req.body;
  const userId = req.user.id;

  // Validate the new PIN
  if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ message: 'PIN must be exactly 4 digits' });
  }

  // Confirm PIN match
  if (newPin !== confirmPin) {
    return res.status(400).json({ message: 'PINs do not match' });
  }

  // Find the user
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Update the PIN directly (no verification of old PIN)
  const salt = await bcrypt.genSalt(10);
  user.pin = await bcrypt.hash(newPin, salt);
  
  // Ensure hasPin flag is set
  user.hasPin = true;
  
  await user.save();

  res.status(200).json({
    success: true,
    message: 'PIN has been reset successfully'
  });
});

// @desc    Check if user needs to set a PIN
// @route   GET /api/users/check-pin-status
// @access  Private
exports.checkPinStatus = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId);
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Check if PIN is set (we can't directly check the PIN value since it's hashed)
  // Instead, we check if the user was created with a randomly generated PIN
  const isDefaultPin = user.createdAt.getTime() === user.updatedAt.getTime();
  
  res.status(200).json({
    success: true,
    needsPinSetup: isDefaultPin,
    message: isDefaultPin ? 'Please set your transaction PIN' : 'PIN already configured'
  });
});




// @desc    Submit verification request with enhanced options
// @route   POST /api/users/verification/submit
// @access  Private
exports.submitVerificationRequest = asyncHandler(async (req, res) => {
  console.log('Controller started');
  console.log('Request body:', req.body);
  console.log('Files received:', req.files ? Object.keys(req.files) : 'No files');
  
  const { fullName, address, idType, idNumber } = req.body;
  
  if (!fullName || !address || !idType || !idNumber) {
    return res.status(400).json({ message: 'Please provide all required fields' });
  }
  
  if (!req.files || !req.files.idCard || !req.files.selfie) {
    return res.status(400).json({ message: 'Please upload both ID card and selfie images' });
  }

  console.log('Validation passed, uploading to Cloudinary');
  const user = await User.findById(req.user.id);
  
  // Check if user already has a pending verification request
  const existingRequest = await VerificationRequest.findOne({ 
    user: req.user.id,
    status: 'pending'
  });
  
  if (existingRequest) {
    return res.status(400).json({ 
      message: 'You already have a pending verification request' 
    });
  }
  
  // Upload ID card to cloudinary
  const idCardResult = await cloudinary.uploader.upload(req.files.idCard[0].path, {
    folder: 'verification/id_cards'
  });
  fs.unlinkSync(req.files.idCard[0].path);
  
  // Upload selfie to cloudinary
  const selfieResult = await cloudinary.uploader.upload(req.files.selfie[0].path, {
    folder: 'verification/selfies'
  });
  fs.unlinkSync(req.files.selfie[0].path);
  
  // Create verification request
  const verificationRequest = await VerificationRequest.create({
    user: req.user.id,
    fullName,
    address,
    idType,
    idNumber,
    idCardImage: idCardResult.secure_url,
    selfieImage: selfieResult.secure_url,
    status: 'pending'
  });
  
  res.status(201).json({
    success: true,
    message: 'Verification request submitted successfully',
    data: {
      id: verificationRequest._id,
      status: verificationRequest.status,
      createdAt: verificationRequest.createdAt
    }
  });
});

// @desc    Get verification status
// @route   GET /api/users/verification/status
// @access  Private
exports.getVerificationStatus = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const user = await User.findById(userId);
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Check if there's a pending verification request
  const pendingRequest = await VerificationRequest.findOne({
    user: userId,
    status: 'pending'
  }).sort({ createdAt: -1 });
  
  // Check if there's a rejected verification request
  const rejectedRequest = await VerificationRequest.findOne({
    user: userId,
    status: 'rejected'
  }).sort({ createdAt: -1 });
  
  // Prepare response object with consistent fields
  const response = {
    success: true,
    isVerified: user.isVerified,
    hasPendingRequest: !!pendingRequest,
    message: user.isVerified ? 'Your account is verified' : 'Your account is not verified'
  };
  
  // Add pending request information if exists
  if (pendingRequest) {
    response.requestDate = pendingRequest.createdAt;
    response.message = 'Your verification request is pending review';
  }
  
  // Add rejected request information if exists
  if (rejectedRequest) {
    response.hasRejectedRequest = true;
    response.requestDate = rejectedRequest.createdAt;
    response.rejectionReason = rejectedRequest.rejectionReason || 'No reason provided';
    
    // Only override message if not pending (pending takes precedence)
    if (!pendingRequest) {
      response.message = 'Your verification request was rejected';
    }
  }
  
  res.status(200).json(response);
});