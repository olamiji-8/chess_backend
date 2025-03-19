const User = require('../models/User');
const VerificationRequest = require('../models/verification');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const crypto = require('crypto');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const generatePKCE = require('../server/utils/pkce');

const CLIENT_ID = process.env.LICHESS_CLIENT_ID;
const REDIRECT_URI = process.env.LICHESS_REDIRECT_URI || 'http://localhost:5000/api/users/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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
  // This is temporary and user will be prompted to change it later
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
    // Set session
    req.session.userId = user._id;
    req.session.isLoggedIn = true;

    // Save session explicitly
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
      }
      
      res.status(201).json({
        success: true,
        data: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          isVerified: user.isVerified
        },
        message: 'Registration successful. Please set your PIN for transactions.'
      });
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
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

  // Set session
  req.session.userId = user._id;
  req.session.isLoggedIn = true;

  // Save session explicitly
  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
    }
    
    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        isVerified: user.isVerified,
        lichessUsername: user.lichessUsername
      }
    });
  });
});

// @desc    Logout user
// @route   GET /api/users/logout
// @access  Private
exports.logoutUser = asyncHandler(async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  });
});

exports.loginWithLichess = (req, res) => {
  const pkce = generatePKCE();
  
  // Store in session instead of global variable
  req.session.codeVerifier = pkce.codeVerifier;
  
  const authUrl = `https://lichess.org/oauth?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&code_challenge_method=S256&code_challenge=${pkce.codeChallenge}&scope=preference:read`;

  console.log('Redirecting to:', authUrl);
  res.redirect(authUrl);
};

exports.handleCallback = async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Authorization code is missing' });
  }

  // Get from session instead of global variable
  const codeVerifier = req.session.codeVerifier;
  
  if (!codeVerifier) {
    return res.status(400).json({ error: 'Code verifier not found. Please start the authentication process again.' });
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', CLIENT_ID);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('code_verifier', codeVerifier);

    const response = await axios.post(
      'https://lichess.org/api/token',
      params,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const accessToken = response.data.access_token;

    const userRes = await axios.get('https://lichess.org/api/account', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const { username } = userRes.data;

    let user = await User.findOne({ lichessUsername: username });
    if (!user) {
      user = new User({ 
        fullName: username,
        email: `${username}@example.com`,
        password: await bcrypt.hash(Math.random().toString(36), 10),
        lichessUsername: username, 
        lichessAccessToken: accessToken 
      });
    } else {
      user.lichessAccessToken = accessToken;
    }
    await user.save();

    // Clear the used code verifier
    req.session.codeVerifier = null;

    // Set user session
    req.session.userId = user._id;
    req.session.isLoggedIn = true;

    res.json({ message: 'Login successful', username });
  } catch (err) {
    console.error('Token exchange error:', err.message);
    res.status(500).send('Login failed');
  }
};


exports.getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.session.userId || req.user.id)
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
  const userId = req.session.userId || req.user.id;
  const user = await User.findById(userId);
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Update user fields
  user.fullName = req.body.fullName || user.fullName;
  user.email = req.body.email || user.email;
  user.phoneNumber = req.body.phoneNumber || user.phoneNumber;
  
  if (req.body.password) {
    user.password = req.body.password;
  }
  
  if (req.file) {
    // Upload profile pic to cloudinary if configured
    try {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: 'profile_pics'
      });
      user.profilePic = uploadResult.secure_url;
      
      // Delete local file after upload
      fs.unlinkSync(req.file.path);
    } catch (error) {
      console.error('Error uploading profile pic:', error);
      user.profilePic = req.file.filename;
    }
  }
  
  // Update bank details if provided
  if (req.body.bankDetails) {
    const { accountNumber, bankCode, accountName } = req.body.bankDetails;
    
    // Only update if all required bank details are provided
    if (accountNumber && bankCode && accountName) {
      try {
        // Optionally verify with Paystack before saving
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
        
        // Save bank details with bank name
        user.bankDetails = {
          accountNumber,
          accountName,
          bankCode,
          bankName: bank.name
        };
        
      } catch (error) {
        console.error('Error verifying bank:', error);
        // If verification fails, still update but add a note
        user.bankDetails = {
          ...req.body.bankDetails,
          verified: false
        };
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Bank details must include accountNumber, bankCode, and accountName'
      });
    }
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
  const userId = req.session.userId || req.user.id;
  
  const user = await User.findById(userId).select('+pin');
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Validate new PIN format
  if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ message: 'PIN must be exactly 4 digits' });
  }
  
  // Check if PINs match
  if (newPin !== confirmPin) {
    return res.status(400).json({ message: 'PINs do not match' });
  }
  
  // If user already has a PIN, verify the current PIN
  if (user.pin) {
    if (!currentPin) {
      return res.status(400).json({ message: 'Current PIN is required' });
    }
    
    const isMatch = await bcrypt.compare(currentPin, user.pin);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current PIN is incorrect' });
    }
  }
  
  // Hash and save the new PIN
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
  const userId = req.session.userId || req.user.id;
  
  if (!pin) {
    return res.status(400).json({ message: 'PIN is required' });
  }
  
  const user = await User.findById(userId).select('+pin');
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Check if PIN exists before comparing
  if (!user.pin) {
    return res.status(400).json({ 
      success: false,
      message: 'PIN has not been set up yet' 
    });
  }
  
  const isPinValid = await bcrypt.compare(pin, user.pin);
  
  res.status(200).json({
    success: isPinValid,
    message: isPinValid ? 'PIN verified successfully' : 'Invalid PIN'
  });
});

// @desc    Check if user needs to set a PIN
// @route   GET /api/users/check-pin-status
// @access  Private
exports.checkPinStatus = asyncHandler(async (req, res) => {
  const userId = req.session.userId || req.user.id;
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
  const { fullName, address, idType } = req.body;
  const userId = req.session.userId || req.user.id;
  
  // Validate required fields
  if (!fullName || !address || !idType) {
    return res.status(400).json({ message: 'Please provide all required fields' });
  }
  
  // Validate ID type is from the allowed categories
  const allowedIdTypes = ['driverLicense', 'internationalPassport', 'nationalID', 'nin', 'votersCard', 'other'];
  if (!allowedIdTypes.includes(idType)) {
    return res.status(400).json({ message: 'Invalid ID type. Please select from the available options.' });
  }
  
  // Check file uploads
  if (!req.files || !req.files.idCard || !req.files.selfie) {
    return res.status(400).json({ message: 'Please upload both ID card and selfie images' });
  }

  const user = await User.findById(userId);
  
  // Check if user already has a pending verification request
  const existingRequest = await VerificationRequest.findOne({ 
    user: userId,
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
    user: userId,
    fullName,
    address,
    idType,
    idCardImage: idCardResult.secure_url,
    selfieImage: selfieResult.secure_url,
    status: 'pending'
  });
  
  res.status(201).json({
    success: true,
    message: 'Verification request submitted successfully. We will review your information and update your status.',
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
  const userId = req.session.userId || req.user.id;
  
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