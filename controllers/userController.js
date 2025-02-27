const User = require('../models/User');
const Transaction = require('../models/Transaction');
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');

// @desc    Register user
// @route   POST /api/users/register
// @access  Public
exports.registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body;
  
  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({ message: 'User with this email already exists' });
  }
  
  // Create user
  const user = await User.create({
    fullName,
    email,
    password
  });
  
  // Generate token
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
  
  res.status(201).json({
    success: true,
    token,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      isVerified: user.isVerified,
      walletBalance: user.walletBalance,
      profilePic: user.profilePic
    }
  });
});

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
exports.loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  // Check if user exists
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  
  // Check if password matches
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  
  // Generate token
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
  
  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      isVerified: user.isVerified,
      walletBalance: user.walletBalance,
      profilePic: user.profilePic
    }
  });
});

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
exports.getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
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

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateUserProfile = asyncHandler(async (req, res) => {
  const { fullName, phoneNumber, lichessUsername, bankDetails } = req.body;
  
  let updateData = {
    fullName,
    phoneNumber,
    lichessUsername,
    bankDetails
  };
  
  // Upload profile pic if provided
  if (req.file) {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'profile_pics'
    });
    updateData.profilePic = result.secure_url;
    // Delete file from server after upload
    fs.unlinkSync(req.file.path);
  }
  
  const user = await User.findByIdAndUpdate(req.user.id, updateData, {
    new: true,
    runValidators: true
  });
  
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
      bankDetails: user.bankDetails
    }
  });
});

// @desc    Verify user identity
// @route   POST /api/users/verify
// @access  Private
exports.verifyUser = asyncHandler(async (req, res) => {
  // This would typically involve checking ID documents
  // For simplicity, we'll just mark the user as verified
  const user = await User.findByIdAndUpdate(req.user.id, 
    { isVerified: true },
    { new: true }
  );
  
  res.status(200).json({
    success: true,
    message: 'User verified successfully',
    isVerified: user.isVerified
  });
});