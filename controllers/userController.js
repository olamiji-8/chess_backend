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


const CLIENT_ID = process.env.LICHESS_CLIENT_ID;
const REDIRECT_URI = process.env.LICHESS_REDIRECT_URI || 'http://localhost:5000/api/users/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';
const TOKEN_EXPIRY = '7d'; // Token expires in 7 days



// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
exports.registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body;

  // Check if user already exists
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  // Generate default PIN for registration
  const defaultPin = Math.floor(1000 + Math.random() * 9000).toString();
  const salt = await bcrypt.genSalt(10);
  const hashedPin = await bcrypt.hash(defaultPin, salt);

  // Create new user
  const user = await User.create({
    fullName,
    email,
    password,
    pin: hashedPin // Store the hashed default PIN
  });

  if (user) {
    // Generate JWT token
    const token = generateToken(user._id);
    
    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        isVerified: user.isVerified,
        token
      },
      message: 'Registration successful. Please set your PIN for transactions.'
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

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


// @desc    Login user
// @route   POST /api/users/login
// @access  Public
exports.loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  // Generate JWT token
  const token = generateToken(user._id);
  
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      isVerified: user.isVerified,
      lichessUsername: user.lichessUsername,
      token
    }
  });
});

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
  
  const authUrl = `https://lichess.org/oauth?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&code_challenge_method=S256&code_challenge=${pkce.codeChallenge}&scope=preference:read`;

  console.log('Redirecting to:', authUrl);
  res.redirect(authUrl);
};

// Handle callback from Lichess
exports.handleCallback = async (req, res) => {
  try {
    const { code } = req.query;
    const codeVerifier = req.signedCookies?.codeVerifier;

    if (!code || !codeVerifier) {
      console.error("❌ Code verifier missing or cookie expired!");
      return res.redirect(`${FRONTEND_URL}/onboarding?error=missing_code_verifier`);
    }

    // Exchange the code for an access token - this is likely slow
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("client_id", CLIENT_ID);
    params.append("redirect_uri", REDIRECT_URI);
    params.append("code_verifier", codeVerifier);

    // Set a timeout for the token request
    const tokenResponse = await axios.post("https://lichess.org/api/token", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 5000 // Add a 5 second timeout
    });

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      throw new Error("Lichess authentication failed: No access token received.");
    }

    // Fetch user details - another potential slowdown
    const userRes = await axios.get("https://lichess.org/api/account", {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 5000 // Add a 5 second timeout
    });

    const { username, email: lichessEmail } = userRes.data;

    // Use findOneAndUpdate instead of find + save to reduce DB operations
    const user = await User.findOneAndUpdate(
      {
        $or: [
          { lichessUsername: username },
          { email: lichessEmail || `${username}@lichess.org` },
        ],
      },
      {
        $setOnInsert: {
          fullName: username,
          email: lichessEmail || `${username}@lichess.org`,
          password: await bcrypt.hash(crypto.randomBytes(20).toString("hex"), 10),
          isVerified: false
        },
        $set: {
          lichessUsername: username,
          lichessAccessToken: accessToken
        }
      },
      { upsert: true, new: true }
    );

    // Clear the code verifier cookie
    res.clearCookie('codeVerifier');

    // Generate JWT token
    const token = generateToken(user._id);

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
  
  // Update user fields from form data
  user.fullName = req.body.fullName || user.fullName;
  user.email = req.body.email || user.email;
  user.phoneNumber = req.body.phoneNumber || user.phoneNumber;
  
  if (req.body.password) {
    user.password = req.body.password;
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
      // If Cloudinary upload fails, use local file path as fallback
      if (req.file.path) {
        user.profilePic = req.file.filename;
      }
    }
  } else if (req.body.profilePic) {
    // Case 2: String URL or base64 handling
    if (req.body.profilePic === "null" || req.body.profilePic === "default") {
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
    // If profilePic is something else, ignore it
  }
  
  // Handle bank details from form data
  if (req.body.accountNumber && req.body.bankCode && req.body.accountName) {
    try {
      // Verify with Paystack before saving
      const bankResponse = await axios.get('https://api.paystack.co/bank', {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      });
      
      // Find bank name from bank code
      const bank = bankResponse.data.data.find(b => b.code === req.body.bankCode);
      
      if (!bank) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid bank code provided' 
        });
      }
      
      // Save bank details with bank name
      user.bankDetails = {
        accountNumber: req.body.accountNumber,
        accountName: req.body.accountName,
        bankCode: req.body.bankCode,
        bankName: bank.name
      };
      
    } catch (error) {
      console.error('Error verifying bank:', error);
      // If verification fails, still update but add a note
      user.bankDetails = {
        accountNumber: req.body.accountNumber,
        accountName: req.body.accountName,
        bankCode: req.body.bankCode,
        verified: false
      };
    }
  } else if (req.body.accountNumber || req.body.bankCode || req.body.accountName) {
    // If any bank field is provided but not all required fields
    return res.status(400).json({
      success: false,
      message: 'Bank details must include accountNumber, bankCode, and accountName'
    });
  }
  
  const updatedUser = await user.save();
  
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
  
  if (user.isVerified) {
    return res.status(200).json({
      success: true,
      isVerified: true,
      message: 'Your account is verified'
    });
  }
  
  // Check if there's a pending verification request
  const pendingRequest = await VerificationRequest.findOne({
    user: userId,
    status: 'pending'
  }).sort({ createdAt: -1 });
  
  if (pendingRequest) {
    return res.status(200).json({
      success: true,
      isVerified: false,
      hasPendingRequest: true,
      requestDate: pendingRequest.createdAt,
      message: 'Your verification request is pending review'
    });
  }
  
  // Check if there's a rejected verification request
  const rejectedRequest = await VerificationRequest.findOne({
    user: userId,
    status: 'rejected'
  }).sort({ createdAt: -1 });
  
  if (rejectedRequest) {
    return res.status(200).json({
      success: true,
      isVerified: false,
      hasRejectedRequest: true,
      requestDate: rejectedRequest.createdAt,
      rejectionReason: rejectedRequest.rejectionReason || 'No reason provided',
      message: 'Your verification request was rejected'
    });
  }
  
  res.status(200).json({
    success: true,
    isVerified: false,
    message: 'Your account is not verified'
  });
});