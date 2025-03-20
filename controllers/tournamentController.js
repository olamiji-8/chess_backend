const Tournament = require('../models/Tournament');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const asyncHandler = require('express-async-handler');
const cloudinary = require('../config/cloudinary');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// @desc    Create a new tournament
// @route   POST /api/tournaments
// @access  Private
exports.createTournament = asyncHandler(async (req, res) => {
  const {
    title,
    category,
    rules,
    startDate,
    startTime,
    duration,
    prizeType,
    prizes,
    entryFee,
    fundingMethod,
    password
  } = req.body;

  // Upload banner image to cloudinary
  let bannerUrl = '';
  if (req.file) {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'tournament_banners'
    });
    bannerUrl = result.secure_url;
    // Delete file from server after upload
    fs.unlinkSync(req.file.path);
  } else {
    return res.status(400).json({ message: 'Please upload a tournament banner' });
  }

  // Calculate total prize pool
  let totalPrizePool = 0;
  if (prizeType === 'fixed') {
    // Sum all fixed prizes
    totalPrizePool = Object.values(prizes.fixed).reduce((sum, prize) => sum + (prize || 0), 0);
  } else if (prizeType === 'percentage') {
    // For percentage, we need to set a base prize pool
    totalPrizePool = prizes.percentage.basePrizePool || 0;
  } else if (prizeType === 'special') {
    if (prizes.special.isFixed) {
      // Calculate total from special prizes
      totalPrizePool = prizes.special.specialPrizes.reduce((sum, prize) => sum + (prize.amount || 0), 0);
    } else {
      // For percentage-based special prizes, use the base prize pool
      totalPrizePool = prizes.special.basePrizePool || 0;
    }
  }

  // Check user wallet balance if funding from wallet
  if (fundingMethod === 'wallet') {
    const user = await User.findById(req.user.id);
    if (user.walletBalance < totalPrizePool) {
      return res.status(400).json({ 
        message: 'Insufficient wallet balance. Please top up or select another payment method',
        walletBalance: user.walletBalance,
        requiredAmount: totalPrizePool
      });
    }

    // Deduct from wallet
    user.walletBalance -= totalPrizePool;
    await user.save();

    // Create transaction record
    await Transaction.create({
      user: req.user.id,
      type: 'tournament_funding',
      amount: totalPrizePool,
      status: 'completed',
      paymentMethod: 'wallet'
    });
  } else if (fundingMethod === 'topup') {
    // Direct user to payment page to top up their wallet
    return res.status(200).json({
      success: false,
      redirectToTopup: true,
      amountNeeded: totalPrizePool,
      message: 'Please complete the payment to fund your tournament'
    });
  }

  // Generate unique tournament link
  const tournamentLink = `https://lichess.org/tournament/${uuidv4()}`;

  // Create tournament
  const tournament = await Tournament.create({
    title,
    category,
    banner: bannerUrl,
    rules,
    startDate,
    startTime,
    duration,
    prizeType,
    prizes,
    entryFee,
    fundingMethod,
    organizer: req.user.id,
    tournamentLink,
    password: password || null
  });

  // Add tournament to user's created tournaments
  await User.findByIdAndUpdate(req.user.id, {
    $push: { createdTournaments: tournament._id }
  });

  res.status(201).json({
    success: true,
    data: tournament
  });
});

// @desc    Get all tournaments with pagination and filters
// @route   GET /api/tournaments
// @access  Public
exports.getTournaments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const category = req.query.category;
  const status = req.query.status || 'active';
  
  let query = {};
  
  // Filter by category if provided
  if (category && category !== 'all') {
    query.category = category;
  }
  
  // Filter by status
  if (status && status !== 'all') {
    query.status = status;
  }

  const total = await Tournament.countDocuments(query);
  
  const tournaments = await Tournament.find(query)
    .populate('organizer', 'fullName email')
    .populate({
      path: 'participants',
      select: 'fullName profilePic',
      options: { limit: 5 } // Limit to just show first 5 participants
    })
    .skip(startIndex)
    .limit(limit)
    .sort({ startDate: 1 });
  
  res.status(200).json({
    success: true,
    count: tournaments.length,
    total,
    pagination: {
      current: page,
      totalPages: Math.ceil(total / limit)
    },
    data: tournaments
  });
});

// @desc    Get single tournament
// @route   GET /api/tournaments/:id
// @access  Public
exports.getTournament = asyncHandler(async (req, res) => {
  const tournament = await Tournament.findById(req.params.id)
    .populate('organizer', 'fullName email phoneNumber')
    .populate('participants', 'fullName profilePic lichessUsername');
  
  if (!tournament) {
    return res.status(404).json({ message: 'Tournament not found' });
  }
  
  res.status(200).json({
    success: true,
    data: tournament
  });
});

// @desc    Register for a tournament
// @route   POST /api/tournaments/:id/register
// @access  Private
exports.registerForTournament = asyncHandler(async (req, res) => {
  const tournament = await Tournament.findById(req.params.id);
  
  if (!tournament) {
    return res.status(404).json({ message: 'Tournament not found' });
  }
  
  // Check if user is already registered
  if (tournament.participants.includes(req.user.id)) {
    return res.status(400).json({ message: 'You are already registered for this tournament' });
  }
  
  const user = await User.findById(req.user.id);
  
  // Check if user has Lichess account linked
  if (!user.lichessUsername) {
    return res.status(400).json({ message: 'You need to link your Lichess account to register for tournaments' });
  }
  
  // Handle entry fee payment if needed
  if (tournament.entryFee > 0) {
    if (user.walletBalance < tournament.entryFee) {
      return res.status(400).json({ 
        message: 'Insufficient wallet balance. Please top up to register',
        walletBalance: user.walletBalance,
        entryFee: tournament.entryFee
      });
    }
    
    // Deduct entry fee from wallet
    user.walletBalance -= tournament.entryFee;
    await user.save();
    
    // Create transaction record
    await Transaction.create({
      user: req.user.id,
      tournament: tournament._id,
      type: 'tournament_entry',
      amount: tournament.entryFee,
      status: 'completed',
      paymentMethod: 'wallet'
    });
  }
  
  // Add user to tournament participants
  tournament.participants.push(req.user.id);
  await tournament.save();
  
  // Add tournament to user's registered tournaments
  user.registeredTournaments.push(tournament._id);
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'Successfully registered for tournament',
    tournamentLink: tournament.tournamentLink,
    password: tournament.password
  });
});


// @desc    Update tournament status
// @route   PUT /api/tournaments/:id/status
// @access  Private (Tournament organizer only)
exports.updateTournamentStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  
  const tournament = await Tournament.findById(req.params.id);
  
  if (!tournament) {
    return res.status(404).json({ message: 'Tournament not found' });
  }
  
  // Check if user is the organizer
  if (tournament.organizer.toString() !== req.user.id) {
    return res.status(403).json({ message: 'You are not authorized to update this tournament' });
  }
  
  tournament.status = status;
  await tournament.save();
  
  res.status(200).json({
    success: true,
    message: 'Tournament status updated successfully',
    status: tournament.status
  });
});