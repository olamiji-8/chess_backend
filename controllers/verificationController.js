const User = require('../models/User');
const VerificationRequest = require('../models/verification');
const asyncHandler = require('express-async-handler');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');

// @desc    Submit verification request
// @route   POST /api/users/verification/submit
// @access  Private
exports.submitVerificationRequest = asyncHandler(async (req, res) => {
  const { fullName, address } = req.body;
  
  if (!fullName || !address) {
    return res.status(400).json({ message: 'Please provide all required fields' });
  }
  
  if (!req.files || !req.files.idCard || !req.files.selfie) {
    return res.status(400).json({ message: 'Please upload both ID card and selfie images' });
  }

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
  const user = await User.findById(req.user.id);
  
  if (user.isVerified) {
    return res.status(200).json({
      success: true,
      isVerified: true,
      message: 'User is verified'
    });
  }
  
  // Find the latest verification request
  const latestRequest = await VerificationRequest.findOne({ 
    user: req.user.id 
  }).sort({ createdAt: -1 });
  
  if (!latestRequest) {
    return res.status(200).json({
      success: true,
      isVerified: false,
      message: 'No verification request found',
      status: 'none'
    });
  }
  
  res.status(200).json({
    success: true,
    isVerified: false,
    message: `Verification ${latestRequest.status}`,
    status: latestRequest.status,
    createdAt: latestRequest.createdAt,
    updatedAt: latestRequest.updatedAt
  });
});

// @desc    Admin - Get all verification requests
// @route   GET /api/admin/verifications
// @access  Private/Admin
exports.getAllVerificationRequests = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const status = req.query.status || 'pending';
  
  const query = { status };
  
  const total = await VerificationRequest.countDocuments(query);
  
  const verificationRequests = await VerificationRequest.find(query)
    .populate('user', 'fullName email profilePic')
    .skip(startIndex)
    .limit(limit)
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: verificationRequests.length,
    total,
    pagination: {
      current: page,
      totalPages: Math.ceil(total / limit)
    },
    data: verificationRequests
  });
});

// @desc    Admin - Approve/Reject verification request
// @route   PUT /api/admin/verifications/:id
// @access  Private/Admin
exports.updateVerificationStatus = asyncHandler(async (req, res) => {
  const { status, rejectionReason } = req.body;
  
  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Please provide a valid status' });
  }
  
  const verificationRequest = await VerificationRequest.findById(req.params.id);
  
  if (!verificationRequest) {
    return res.status(404).json({ message: 'Verification request not found' });
  }
  
  // Update verification request
  verificationRequest.status = status;
  if (status === 'rejected' && rejectionReason) {
    verificationRequest.rejectionReason = rejectionReason;
  }
  await verificationRequest.save();
  
  // If approved, update user verified status
  if (status === 'approved') {
    await User.findByIdAndUpdate(verificationRequest.user, { isVerified: true });
  }
  
  res.status(200).json({
    success: true,
    message: `Verification request ${status}`,
    data: verificationRequest
  });
});