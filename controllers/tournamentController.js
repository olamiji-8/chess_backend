  const Tournament = require('../models/Tournament');
  const User = require('../models/User');
  const Transaction = require('../models/Transaction');
  const asyncHandler = require('express-async-handler');
  const cloudinary = require('../config/cloudinary');
  const { v4: uuidv4 } = require('uuid');
  const fs = require('fs');
  const cron = require('node-cron');
  const {
  notifyTournamentRegistration,
  notifyTournamentStartingInFiveMinutes,
  notifyTournamentWinner
} = require('./notificationController');

// @desc    Create a new tournament
// @route   POST /api/tournaments
// @access  Private
// Enhanced createTournament controller with improved error handling
exports.createTournament = asyncHandler(async (req, res) => {
  try {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
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
      tournamentLink, // Added tournamentLink to be provided by organizer
      password // Password is now optional
    } = req.body;
    
    // Parse entry fee as number - MOVED THIS UP
    const parsedEntryFee = parseFloat(entryFee) || 0; // Default to 0 if invalid
    
    // Validate required fields (removed password from required fields, added tournamentLink)
    if (!title || !category || !rules || !startDate || !startTime || !duration || !prizeType || !fundingMethod || !tournamentLink) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        missingFields: [
          !title ? 'title' : null,
          !category ? 'category' : null,
          !rules ? 'rules' : null,
          !startDate ? 'startDate' : null,
          !startTime ? 'startTime' : null,
          !duration ? 'duration' : null,
          !prizeType ? 'prizeType' : null,
          !fundingMethod ? 'fundingMethod' : null,
          !tournamentLink ? 'tournamentLink' : null
        ].filter(Boolean)
      });
    }

    // Validate tournament link format (basic URL validation)
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    if (!urlPattern.test(tournamentLink)) {
      return res.status(400).json({ 
        message: 'Please provide a valid tournament link URL' 
      });
    }

    // Upload banner image to cloudinary
    let bannerUrl = '';
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'tournament_banners'
        });
        bannerUrl = result.secure_url;
        // Delete file from server after upload
        fs.unlinkSync(req.file.path);
      } catch (cloudinaryError) {
        console.error('Cloudinary upload error:', cloudinaryError);
        return res.status(500).json({ 
          message: 'Error uploading tournament banner',
          error: cloudinaryError.message
        });
      }
    } else {
      return res.status(400).json({ message: 'Please upload a tournament banner' });
    }

    // Initialize default prize structure based on prizeType
    let normalizedPrizes = {};
    
    // Normalize prizes structure based on prizeType
    if (prizeType === 'fixed') {
      normalizedPrizes = {
        fixed: {
          '1st': 0,
          '2nd': 0,
          '3rd': 0,
          '4th': 0,
          '5th': 0,
          additional: []
        }
      };
      
      // If prizes.fixed exists and is an object, try to extract values
      if (prizes && prizes.fixed && typeof prizes.fixed === 'object') {
        console.log('Prizes fixed object:', JSON.stringify(prizes.fixed));
        
        // Parse numeric values from the prizes.fixed object
        if (prizes.fixed['1st']) normalizedPrizes.fixed['1st'] = parseFloat(prizes.fixed['1st']) || 0;
        if (prizes.fixed['2nd']) normalizedPrizes.fixed['2nd'] = parseFloat(prizes.fixed['2nd']) || 0;
        if (prizes.fixed['3rd']) normalizedPrizes.fixed['3rd'] = parseFloat(prizes.fixed['3rd']) || 0;
        if (prizes.fixed['4th']) normalizedPrizes.fixed['4th'] = parseFloat(prizes.fixed['4th']) || 0;
        if (prizes.fixed['5th']) normalizedPrizes.fixed['5th'] = parseFloat(prizes.fixed['5th']) || 0;
        
        // Handle additional prizes if they exist
        if (prizes.fixed.additional && Array.isArray(prizes.fixed.additional)) {
          normalizedPrizes.fixed.additional = prizes.fixed.additional.map(prize => ({
            position: parseInt(prize.position) || 0,
            amount: parseFloat(prize.amount) || 0
          }));
        }
      } else {
        console.warn('Invalid or missing prizes.fixed structure');
      }
    } else if (prizeType === 'percentage') {
      normalizedPrizes = {
        percentage: {
          basePrizePool: 0,
          '1st': 0,
          '2nd': 0,
          '3rd': 0,
          '4th': 0,
          '5th': 0,
          additional: []
        }
      };
      
      // Similar parsing for percentage prizes
      if (prizes && prizes.percentage && typeof prizes.percentage === 'object') {
        if (prizes.percentage.basePrizePool) normalizedPrizes.percentage.basePrizePool = parseFloat(prizes.percentage.basePrizePool) || 0;
        if (prizes.percentage['1st']) normalizedPrizes.percentage['1st'] = parseFloat(prizes.percentage['1st']) || 0;
        if (prizes.percentage['2nd']) normalizedPrizes.percentage['2nd'] = parseFloat(prizes.percentage['2nd']) || 0;
        if (prizes.percentage['3rd']) normalizedPrizes.percentage['3rd'] = parseFloat(prizes.percentage['3rd']) || 0;
        if (prizes.percentage['4th']) normalizedPrizes.percentage['4th'] = parseFloat(prizes.percentage['4th']) || 0;
        if (prizes.percentage['5th']) normalizedPrizes.percentage['5th'] = parseFloat(prizes.percentage['5th']) || 0;
        
        if (prizes.percentage.additional && Array.isArray(prizes.percentage.additional)) {
          normalizedPrizes.percentage.additional = prizes.percentage.additional.map(prize => ({
            position: parseInt(prize.position) || 0,
            percentage: parseFloat(prize.percentage) || 0
          }));
        }
      }
    } else if (prizeType === 'special') {
      normalizedPrizes = {
        special: {
          isFixed: true,
          basePrizePool: 0,
          specialPrizes: []
        }
      };
      
      if (prizes && prizes.special && typeof prizes.special === 'object') {
        if (typeof prizes.special.isFixed === 'boolean') normalizedPrizes.special.isFixed = prizes.special.isFixed;
        if (prizes.special.basePrizePool) normalizedPrizes.special.basePrizePool = parseFloat(prizes.special.basePrizePool) || 0;
        
        if (prizes.special.specialPrizes && Array.isArray(prizes.special.specialPrizes)) {
          normalizedPrizes.special.specialPrizes = prizes.special.specialPrizes.map(prize => ({
            category: prize.category || '',
            amount: parseFloat(prize.amount) || 0,
            isPercentage: prize.isPercentage === true
          }));
        }
      }
    }

    console.log('Normalized prizes structure:', JSON.stringify(normalizedPrizes, null, 2));

    // Calculate total prize pool
    let totalPrizePool = 0;
    try {
      if (prizeType === 'fixed') {
        // Sum all fixed prizes
        totalPrizePool = normalizedPrizes.fixed['1st'] + 
                        normalizedPrizes.fixed['2nd'] + 
                        normalizedPrizes.fixed['3rd'] + 
                        normalizedPrizes.fixed['4th'] + 
                        normalizedPrizes.fixed['5th'];
                        
        // Add additional prizes if any
        if (normalizedPrizes.fixed.additional && normalizedPrizes.fixed.additional.length) {
          totalPrizePool += normalizedPrizes.fixed.additional.reduce((sum, prize) => sum + (prize.amount || 0), 0);
        }
      } else if (prizeType === 'percentage') {
        // For percentage, we use the base prize pool
        totalPrizePool = normalizedPrizes.percentage.basePrizePool || 0;
      } else if (prizeType === 'special') {
        if (normalizedPrizes.special.isFixed) {
          // Calculate total from special prizes
          totalPrizePool = normalizedPrizes.special.specialPrizes.reduce((sum, prize) => sum + (prize.amount || 0), 0);
        } else {
          // For percentage-based special prizes, use the base prize pool
          totalPrizePool = normalizedPrizes.special.basePrizePool || 0;
        }
      }
      
      console.log('Calculated total prize pool:', totalPrizePool);
    } catch (prizeCalcError) {
      console.error('Error calculating prize pool:', prizeCalcError);
      return res.status(400).json({ 
        message: 'Error calculating prize pool',
        error: prizeCalcError.message
      });
    }
    
    // Check if entry fee is higher than total prize pool
    if (parsedEntryFee > totalPrizePool) {
      return res.status(400).json({
        message: 'Entry fee cannot be higher than the total prize pool',
        entryFee: parsedEntryFee,
        totalPrizePool: totalPrizePool
      });
    }
    
    // Generate unique transaction reference that we can use later
    const transactionReference = `FUND-${uuidv4().slice(0,8)}`;

    // Check user wallet balance if funding from wallet
    if (fundingMethod === 'wallet') {
      try {
        const user = await User.findById(req.user.id);
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
        
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
        
      } catch (walletError) {
        console.error('Wallet processing error:', walletError);
        return res.status(500).json({ 
          message: 'Error processing wallet transaction',
          error: walletError.message
        });
      }
    } else if (fundingMethod === 'topup') {
      // Direct user to payment page to top up their wallet
      return res.status(200).json({
        success: false,
        redirectToTopup: true,
        amountNeeded: totalPrizePool,
        message: 'Please complete the payment to fund your tournament'
      });
    }
// Helper function to parse duration string to milliseconds
const parseDurationToMs = (durationStr) => {
  if (!durationStr || typeof durationStr !== 'string') {
    throw new Error('Invalid duration format');
  }
  
  // Remove spaces and convert to lowercase
  const duration = durationStr.trim().toLowerCase();
  
  // Extract number and unit
  const match = duration.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);
  
  if (!match) {
    throw new Error('Invalid duration format. Use formats like: 30m, 1.5h, 2h, 90m');
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2];
  
  // Convert to milliseconds based on unit
  switch (unit) {
    case 's':
    case 'sec':
    case 'second':
    case 'seconds':
      return value * 1000;
      
    case 'm':
    case 'min':
    case 'minute':
    case 'minutes':
      return value * 60 * 1000;
      
    case 'h':
    case 'hr':
    case 'hour':
    case 'hours':
      return value * 60 * 60 * 1000;
      
    case 'd':
    case 'day':
    case 'days':
      return value * 24 * 60 * 60 * 1000;
      
    default:
      throw new Error(`Unsupported time unit: ${unit}. Supported units: s, m, h, d`);
  }
};

// Helper function to convert milliseconds to readable duration
const msToReadableDuration = (ms) => {
  if (!ms || ms < 0) {
    return '0 minutes';
  }
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      return `${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''}`;
    }
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  
  return `${seconds} second${seconds > 1 ? 's' : ''}`;
};

module.exports = {
  parseDurationToMs,
  msToReadableDuration
};

const durationInHours = parseFloat(duration);

// Validate duration
if (isNaN(durationInHours) || durationInHours <= 0) {
  return res.status(400).json({
    message: 'Invalid duration. Duration must be a positive number representing hours.',
    error: 'Duration validation failed'
  });
}
// Convert hours to milliseconds
const durationInMs = durationInHours * 60 * 60 * 1000;

console.log(`Duration: ${durationInHours} hours → ${durationInMs}ms`);

    try {
      // Create tournament with normalized data
      const tournament = await Tournament.create({
        title,
        category,
        banner: bannerUrl,
        rules,
        startDate: new Date(startDate),
        startTime,
        duration: durationInMs,
        prizeType,
        prizes: normalizedPrizes,
        entryFee: parsedEntryFee,
        fundingMethod,
        organizer: req.user.id,
        tournamentLink, // Use the provided tournament link
        password: password || null // Password is optional - only set if provided
      });
    
      console.log('Tournament created successfully:', tournament._id);
    
      // Create transaction record now that we have the tournament ID
      if (fundingMethod === 'wallet') {
        try {
          const transaction = await Transaction.create({
            user: req.user.id,
            tournament: tournament._id,
            type: 'tournament_funding',
            amount: totalPrizePool,
            status: 'completed',
            paymentMethod: 'wallet',
            reference: transactionReference
          });
          console.log('Transaction created successfully:', transaction._id);
        } catch (transactionError) {
          console.error('Error creating transaction record:', transactionError);
        }
      }
    
      // Add tournament to user's created tournaments
      await User.findByIdAndUpdate(req.user.id, {
        $push: { createdTournaments: tournament._id }
      });
      console.log('Tournament added to user\'s created tournaments');

      // Schedule 5-minute reminder notification
      await scheduleTournamentReminder(tournament._id, tournament.startDate, tournament.startTime);
    
      res.status(201).json({
        success: true,
        data: tournament
      });
    } catch (createError) {
      console.error('Tournament creation error details:', createError);
      // Print detailed validation errors if they exist
      if (createError.errors) {
        console.error('Validation errors:', JSON.stringify(createError.errors));
      }
      return res.status(500).json({ 
        message: 'Error creating tournament',
        error: createError.message,
        validationErrors: createError.errors
      });
    }
  } catch (outerError) {
    console.error('Unexpected error in createTournament:', outerError);
    return res.status(500).json({
      message: 'An unexpected error occurred',
      error: outerError.message
    });
  }
});

exports.getTournaments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const category = req.query.category;
  const status = req.query.status || 'upcoming';
  
  console.log('Fetching tournaments with params:', { 
    page, 
    limit, 
    category, 
    status 
  });
  
  let query = {};
  
  // Filter by category if provided
  if (category && category !== 'all') {
    query.category = category;
  }
  
  // First, update all tournament statuses
  await updateAllTournamentStatuses();
  
  // Now apply status filter after updates
  if (status && status !== 'all') {
    query.status = status;
  }

  const total = await Tournament.countDocuments(query);
  
  const tournaments = await Tournament.find(query)
    .populate('organizer', 'fullName email')
    .populate({
      path: 'participants',
      select: 'fullName profilePic',
      options: { limit: 5 }
    })
    .skip(startIndex)
    .limit(limit)
    .sort({ startDate: 1 });
  
  // Convert duration and add calculated fields
  const formattedTournaments = tournaments.map(tournament => {
    const tournamentObj = tournament.toObject();
    tournamentObj.durationInHours = tournament.duration / 3600000;
    tournamentObj.startDateTime = tournament.getStartDateTime();
    tournamentObj.endDateTime = tournament.getEndDateTime();
    tournamentObj.currentStatus = tournament.currentStatus;
    return tournamentObj;
  });
  
  res.status(200).json({
    success: true,
    count: formattedTournaments.length,
    total,
    pagination: {
      current: page,
      totalPages: Math.ceil(total / limit)
    },
    data: formattedTournaments
  });
});

// Utility function to update all tournament statuses
async function updateAllTournamentStatuses() {
  try {
    const tournaments = await Tournament.find({
      status: { $in: ['upcoming', 'active'] },
      manualStatusOverride: { $ne: true }
    });

    let updatedCount = 0;
    
    for (const tournament of tournaments) {
      if (tournament.updateStatusBasedOnTime()) {
        await tournament.save();
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`Updated status for ${updatedCount} tournaments`);
    }
  } catch (error) {
    console.error('Error updating tournament statuses:', error);
  }
}


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
  
  // Convert duration from milliseconds to hours for client display
  const tournamentObj = tournament.toObject();
  tournamentObj.durationInHours = tournament.duration / 3600000;
  
  res.status(200).json({
    success: true,
    data: tournamentObj
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
    
    // Get confirmation from the request body
    const { confirmed } = req.body;
    
    if (!confirmed) {
      return res.status(400).json({ 
        message: 'Please confirm registration to proceed',
        requiresConfirmation: true,
        tournament: {
          id: tournament._id,
          title: tournament.title,
          entryFee: tournament.entryFee
        }
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
      paymentMethod: 'wallet',
      reference: `ENTRY-${uuidv4().slice(0,8)}` // Generate a reference ID
    });
  }
  
  // Add user to tournament participants
  tournament.participants.push(req.user.id);
  await tournament.save();
  
  // Add tournament to user's registered tournaments
  user.registeredTournaments.push(tournament._id);
  await user.save();

  // 🎯 AUTOMATED NOTIFICATION: Tournament Registration Success
  try {
    await notifyTournamentRegistration(req.user.id, tournament._id, tournament.title);
    console.log('Registration notification sent successfully');
  } catch (notificationError) {
    console.error('Failed to send registration notification:', notificationError);
    // Don't fail the registration if notification fails
  }
  
  res.status(200).json({
    success: true,
    message: 'Successfully registered for tournament',
    tournamentLink: tournament.tournamentLink,
    password: tournament.password || '', // Return empty string if password is null
    tournamentDetails: {
      title: tournament.title,
      startDate: tournament.startDate,
      startTime: tournament.startTime
    }
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

// New endpoint for pre-registration check
// @desc    Check if user can register for tournament
// @route   GET /api/tournaments/:id/registration-check
// @access  Private
exports.checkTournamentRegistration = asyncHandler(async (req, res) => {
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
  
  // Check wallet balance if there's an entry fee
  if (tournament.entryFee > 0) {
    if (user.walletBalance < tournament.entryFee) {
      return res.status(400).json({ 
        success: false,
        message: 'Insufficient wallet balance. Please top up to register',
        walletBalance: user.walletBalance,
        entryFee: tournament.entryFee
      });
    }
  }
  
  // Return success with tournament details for confirmation
  res.status(200).json({
    success: true,
    message: 'You can register for this tournament',
    tournament: {
      id: tournament._id,
      title: tournament.title,
      entryFee: tournament.entryFee,
      startDate: tournament.startDate,
      startTime: tournament.startTime
    }
  });
});

// @desc    Submit tournament results and distribute prizes
// @route   POST /api/tournaments/:id/results
// @access  Private (Tournament organizer only)
exports.submitTournamentResults = asyncHandler(async (req, res) => {
  const { results } = req.body; // Array of { userId, position, score }
  
  const tournament = await Tournament.findById(req.params.id)
    .populate('participants', 'fullName email walletBalance');
  
  if (!tournament) {
    return res.status(404).json({ message: 'Tournament not found' });
  }
  
  // Check if user is the organizer
  if (tournament.organizer.toString() !== req.user.id) {
    return res.status(403).json({ message: 'You are not authorized to submit results for this tournament' });
  }
  
  // Validate results format
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ message: 'Invalid results format' });
  }

  try {
    // Calculate and distribute prizes
    const prizeDistribution = await calculatePrizeDistribution(tournament, results);
    
    // Update user wallets and create transaction records
    for (const prize of prizeDistribution) {
      if (prize.amount > 0) {
        // Update user wallet
        await User.findByIdAndUpdate(prize.userId, {
          $inc: { walletBalance: prize.amount }
        });
        
        // Create prize transaction record
        await Transaction.create({
          user: prize.userId,
          tournament: tournament._id,
          type: 'tournament_prize',
          amount: prize.amount,
          status: 'completed',
          paymentMethod: 'wallet',
          reference: `PRIZE-${uuidv4().slice(0,8)}`,
          description: `Prize for ${prize.position} place in ${tournament.title}`
        });

        // 🎯 AUTOMATED NOTIFICATION: Tournament Winner
        try {
          await notifyTournamentWinner(
            prize.userId, 
            tournament._id, 
            tournament.title, 
            prize.position, 
            prize.amount
          );
          console.log(`Winner notification sent to user ${prize.userId}`);
        } catch (notificationError) {
          console.error('Failed to send winner notification:', notificationError);
          // Continue with other winners even if one notification fails
        }
      }
    }
    
    // Update tournament status to completed
    tournament.status = 'completed';
    tournament.results = results;
    await tournament.save();
    
    res.status(200).json({
      success: true,
      message: 'Tournament results submitted and prizes distributed successfully',
      prizeDistribution
    });
  } catch (error) {
    console.error('Error submitting tournament results:', error);
    res.status(500).json({ 
      message: 'Error processing tournament results',
      error: error.message
    });
  }
});

// ==================== HELPER FUNCTIONS ====================

// Helper function to calculate prize distribution
const calculatePrizeDistribution = async (tournament, results) => {
  const distribution = [];
  const { prizeType, prizes } = tournament;
  
  // Sort results by position
  const sortedResults = results.sort((a, b) => a.position - b.position);
  
  if (prizeType === 'fixed') {
    const fixedPrizes = prizes.fixed;
    
    // Standard positions
    const positions = ['1st', '2nd', '3rd', '4th', '5th'];
    
    for (let i = 0; i < sortedResults.length && i < positions.length; i++) {
      const result = sortedResults[i];
      const position = positions[i];
      const amount = fixedPrizes[position] || 0;
      
      if (amount > 0) {
        distribution.push({
          userId: result.userId,
          position: i + 1,
          amount: amount
        });
      }
    }
    
    // Additional prizes
    if (fixedPrizes.additional && fixedPrizes.additional.length > 0) {
      for (const additionalPrize of fixedPrizes.additional) {
        const result = sortedResults.find(r => r.position === additionalPrize.position);
        if (result && additionalPrize.amount > 0) {
          distribution.push({
            userId: result.userId,
            position: additionalPrize.position,
            amount: additionalPrize.amount
          });
        }
      }
    }
  } else if (prizeType === 'percentage') {
    const percentagePrizes = prizes.percentage;
    const basePrizePool = percentagePrizes.basePrizePool;
    
    const positions = ['1st', '2nd', '3rd', '4th', '5th'];
    
    for (let i = 0; i < sortedResults.length && i < positions.length; i++) {
      const result = sortedResults[i];
      const position = positions[i];
      const percentage = percentagePrizes[position] || 0;
      const amount = (basePrizePool * percentage) / 100;
      
      if (amount > 0) {
        distribution.push({
          userId: result.userId,
          position: i + 1,
          amount: Math.round(amount * 100) / 100 // Round to 2 decimal places
        });
      }
    }
  } else if (prizeType === 'special') {
    const specialPrizes = prizes.special;
    
    for (const specialPrize of specialPrizes.specialPrizes) {
      // Find winner based on special category logic
      // This is a simplified example - you might need more complex logic
      const result = sortedResults[0]; // For now, give to first place
      
      let amount = 0;
      if (specialPrize.isPercentage) {
        amount = (specialPrizes.basePrizePool * specialPrize.amount) / 100;
      } else {
        amount = specialPrize.amount;
      }
      
      if (amount > 0) {
        distribution.push({
          userId: result.userId,
          position: 1,
          amount: Math.round(amount * 100) / 100,
          category: specialPrize.category
        });
      }
    }
  }
  
  return distribution;
};

// Helper function to schedule tournament reminder
const scheduleTournamentReminder = async (tournamentId, startDate, startTime) => {
  try {
    // Parse start date and time
    const tournamentStart = new Date(`${startDate}T${startTime}`);
    const reminderTime = new Date(tournamentStart.getTime() - 5 * 60 * 1000); // 5 minutes before
    
    // Calculate delay in milliseconds
    const now = new Date();
    const delay = reminderTime.getTime() - now.getTime();
    
    if (delay > 0) {
      // Schedule the reminder
      setTimeout(async () => {
        try {
          await notifyTournamentStartingInFiveMinutes(tournamentId);
          console.log(`5-minute reminder sent for tournament ${tournamentId}`);
        } catch (error) {
          console.error('Error sending 5-minute reminder:', error);
        }
      }, delay);
      
      console.log(`Tournament reminder scheduled for ${reminderTime.toISOString()}`);
    } else {
      console.log('Tournament start time has already passed, no reminder scheduled');
    }
  } catch (error) {
    console.error('Error scheduling tournament reminder:', error);
  }
};


// ==================== CRON JOBS FOR AUTOMATED NOTIFICATIONS ====================
// Cron job to check for tournaments starting in 5 minutes
// Runs every minute to check for upcoming tournaments
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    // Find tournaments starting in approximately 5 minutes
    // We check for tournaments starting between now and 6 minutes from now
    // to account for the 1-minute cron interval
    const sixMinutesFromNow = new Date(now.getTime() + 6 * 60 * 1000);
    
    const upcomingTournaments = await Tournament.find({
      status: 'upcoming',
      startDate: {
        $gte: now.toISOString().split('T')[0], // Today or later
        $lte: fiveMinutesFromNow.toISOString().split('T')[0] // Today only for this check
      }
    }).populate('participants', 'fullName email');
    
    for (const tournament of upcomingTournaments) {
      // Create full datetime for comparison
      const tournamentDateTime = new Date(`${tournament.startDate.toISOString().split('T')[0]}T${tournament.startTime}`);
      
      // Check if tournament starts within the next 5-6 minutes
      if (tournamentDateTime >= fiveMinutesFromNow && tournamentDateTime <= sixMinutesFromNow) {
        // Check if we haven't already sent this notification
        if (!tournament.fiveMinuteReminderSent) {
          try {
            await notifyTournamentStartingInFiveMinutes(tournament._id);
            
            // Mark as reminder sent to avoid duplicate notifications
            await Tournament.findByIdAndUpdate(tournament._id, {
              $set: { fiveMinuteReminderSent: true }
            });
            
            console.log(`5-minute reminder sent for tournament: ${tournament.title}`);
          } catch (notificationError) {
            console.error(`Failed to send 5-minute reminder for tournament ${tournament._id}:`, notificationError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in 5-minute reminder cron job:', error);
  }
});

// Cron job to automatically update tournament status
// Runs every 5 minutes to update tournament statuses
cron.schedule('*/5 * * * *', async () => {
  try {
    const now = new Date();
    
    // Update tournaments from 'upcoming' to 'active' when they start
    const tournamentsToStart = await Tournament.find({
      status: 'upcoming'
    });
    
    for (const tournament of tournamentsToStart) {
      const tournamentStart = new Date(`${tournament.startDate.toISOString().split('T')[0]}T${tournament.startTime}`);
      
      if (now >= tournamentStart) {
        await Tournament.findByIdAndUpdate(tournament._id, {
          $set: { status: 'active' }
        });
        console.log(`Tournament ${tournament.title} status updated to active`);
      }
    }
    
    // Update tournaments from 'active' to 'ended' when they finish
    const activeTournaments = await Tournament.find({
      status: 'active'
    });
    
    for (const tournament of activeTournaments) {
      const tournamentStart = new Date(`${tournament.startDate.toISOString().split('T')[0]}T${tournament.startTime}`);
      const tournamentEnd = new Date(tournamentStart.getTime() + tournament.duration);
      
      if (now >= tournamentEnd) {
        await Tournament.findByIdAndUpdate(tournament._id, {
          $set: { status: 'ended' }
        });
        console.log(`Tournament ${tournament.title} status updated to ended`);
      }
    }
  } catch (error) {
    console.error('Error in tournament status update cron job:', error);
  }
});


// @desc    Distribute prizes to tournament winners
// @route   POST /api/tournaments/:tournamentId/distribute-prizes
// @access  Private (Organizer only)
exports.distributeTournamentPrizes = asyncHandler(async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { prizeDistribution } = req.body; // Array of { userId, position, customAmount (optional) }
    
    console.log('Prize distribution request:', JSON.stringify(req.body, null, 2));
    
    // Validate request body
    if (!prizeDistribution || !Array.isArray(prizeDistribution) || prizeDistribution.length === 0) {
      return res.status(400).json({
        message: 'Prize distribution data is required and must be an array'
      });
    }
    
    // Find tournament and verify organizer
    const tournament = await Tournament.findById(tournamentId).populate('organizer participants');
    if (!tournament) {
      return res.status(404).json({ message: 'Tournament not found' });
    }
    
    // Check if user is the organizer
    if (tournament.organizer._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only tournament organizer can distribute prizes' });
    }
    
    // Check if tournament is completed
    if (tournament.status !== 'completed') {
      return res.status(400).json({ 
        message: 'Tournament must be completed before distributing prizes',
        currentStatus: tournament.status
      });
    }
    
    // Check if prizes have already been distributed
    const existingPrizePayouts = await Transaction.find({
      tournament: tournamentId,
      type: 'prize_payout',
      status: 'completed'
    });
    
    if (existingPrizePayouts.length > 0) {
      return res.status(400).json({ 
        message: 'Prizes have already been distributed for this tournament' 
      });
    }
    
    // Validate all users in prize distribution are tournament participants
    const participantIds = tournament.participants.map(p => p._id.toString());
    const invalidUsers = prizeDistribution.filter(prize => 
      !participantIds.includes(prize.userId)
    );
    
    if (invalidUsers.length > 0) {
      return res.status(400).json({
        message: 'Some users in prize distribution are not tournament participants',
        invalidUsers: invalidUsers.map(u => u.userId)
      });
    }
    
    // Calculate prize amounts based on tournament prize structure
    const calculatedPrizes = [];
    let totalDistributedAmount = 0;
    
    for (const prize of prizeDistribution) {
      let prizeAmount = 0;
      const position = prize.position; // e.g., '1st', '2nd', '3rd', etc.
      
      // Calculate prize based on tournament prize type
      if (tournament.prizeType === 'fixed') {
        if (tournament.prizes.fixed[position]) {
          prizeAmount = tournament.prizes.fixed[position];
        } else {
          // Handle additional positions
          const additionalPrize = tournament.prizes.fixed.additional?.find(
            ap => ap.position.toString() === position.replace(/\D/g, '')
          );
          prizeAmount = additionalPrize ? additionalPrize.amount : 0;
        }
      } else if (tournament.prizeType === 'percentage') {
        const basePrizePool = tournament.prizes.percentage.basePrizePool || 0;
        let percentage = 0;
        
        if (tournament.prizes.percentage[position]) {
          percentage = tournament.prizes.percentage[position];
        } else {
          // Handle additional positions
          const additionalPrize = tournament.prizes.percentage.additional?.find(
            ap => ap.position.toString() === position.replace(/\D/g, '')
          );
          percentage = additionalPrize ? additionalPrize.percentage : 0;
        }
        
        prizeAmount = (basePrizePool * percentage) / 100;
      } else if (tournament.prizeType === 'special') {
        // For special prizes, find matching category
        const specialPrize = tournament.prizes.special.specialPrizes?.find(
          sp => sp.category === position || sp.category.toLowerCase().includes(position.toLowerCase())
        );
        
        if (specialPrize) {
          if (tournament.prizes.special.isFixed || !specialPrize.isPercentage) {
            prizeAmount = specialPrize.amount;
          } else {
            // Percentage-based special prize
            const basePrizePool = tournament.prizes.special.basePrizePool || 0;
            prizeAmount = (basePrizePool * specialPrize.amount) / 100;
          }
        }
      }
      
      // Use custom amount if provided (for flexibility)
      if (prize.customAmount && prize.customAmount > 0) {
        prizeAmount = prize.customAmount;
      }
      
      if (prizeAmount <= 0) {
        return res.status(400).json({
          message: `Invalid prize amount for position ${position}`,
          userId: prize.userId,
          position: position
        });
      }
      
      calculatedPrizes.push({
        userId: prize.userId,
        position: position,
        amount: prizeAmount
      });
      
      totalDistributedAmount += prizeAmount;
    }
    
    console.log('Calculated prizes:', calculatedPrizes);
    console.log('Total amount to distribute:', totalDistributedAmount);
    
    // Start database transaction for atomic operations
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const results = [];
      
      for (const prize of calculatedPrizes) {
        // Find the user
        const user = await User.findById(prize.userId).session(session);
        if (!user) {
          throw new Error(`User not found: ${prize.userId}`);
        }
        
        // Update user wallet balance
        user.walletBalance += prize.amount;
        await user.save({ session });
        
        // Create transaction record
        const transactionReference = `PRIZE-${tournamentId.slice(-8)}-${prize.userId.slice(-8)}-${Date.now()}`;
        
        const transaction = await Transaction.create([{
          user: prize.userId,
          tournament: tournamentId,
          type: 'prize_payout',
          amount: prize.amount,
          reference: transactionReference,
          paymentMethod: 'wallet',
          status: 'completed',
          details: {
            position: prize.position,
            tournamentTitle: tournament.title
          },
          metadata: {
            distributedBy: req.user.id,
            distributionDate: new Date()
          }
        }], { session });
        
        // Use notifyTournamentWinner instead of createNotification
        await notifyTournamentWinner(
          prize.userId,
          tournamentId,
          tournament.title,
          prize.position,
          prize.amount
        );
        
        results.push({
          userId: prize.userId,
          userName: user.fullName,
          position: prize.position,
          amount: prize.amount,
          transactionId: transaction[0]._id,
          newWalletBalance: user.walletBalance
        });
      }
      
      // Update tournament status to indicate prizes have been distributed
      await Tournament.findByIdAndUpdate(
        tournamentId,
        { 
          $set: { 
            'metadata.prizesDistributed': true,
            'metadata.prizeDistributionDate': new Date(),
            'metadata.distributedBy': req.user.id
          }
        },
        { session }
      );
      
      // Commit the transaction
      await session.commitTransaction();
      
      console.log('Prize distribution successful:', results);
      
      res.status(200).json({
        success: true,
        message: 'Prizes distributed successfully',
        data: {
          tournamentId,
          tournamentTitle: tournament.title,
          totalDistributed: totalDistributedAmount,
          winners: results,
          distributionDate: new Date()
        }
      });
      
    } catch (transactionError) {
      // Rollback the transaction
      await session.abortTransaction();
      throw transactionError;
    } finally {
      session.endSession();
    }
    
  } catch (error) {
    console.error('Prize distribution error:', error);
    res.status(500).json({
      message: 'Error distributing prizes',
      error: error.message
    });
  }
});


// @desc    Get tournament participants for prize distribution
// @route   GET /api/tournaments/:tournamentId/participants
// @access  Private (Organizer only)
exports.getTournamentParticipants = asyncHandler(async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { status } = req.query; // Get status filter from query params
    
    const tournament = await Tournament.findById(tournamentId)
      .populate('participants', 'fullName email profilePic lichessUsername')
      .populate('organizer', 'fullName email');
    
    if (!tournament) {
      return res.status(404).json({ message: 'Tournament not found' });
    }
    
    // Check if user is the organizer
    if (tournament.organizer._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only tournament organizer can view participants' });
    }
    
    // Filter by status if provided
    if (status && tournament.status !== status) {
      return res.status(200).json({
        success: true,
        data: {
          tournament: {
            id: tournament._id,
            title: tournament.title,
            status: tournament.status,
            prizeType: tournament.prizeType,
            prizeStructure: {}
          },
          participants: [],
          totalParticipants: 0
        }
      });
    }
    
    // Get prize structure for reference
    const prizeStructure = {};
    if (tournament.prizeType === 'fixed') {
      prizeStructure.fixed = tournament.prizes.fixed;
    } else if (tournament.prizeType === 'percentage') {
      prizeStructure.percentage = tournament.prizes.percentage;
    } else if (tournament.prizeType === 'special') {
      prizeStructure.special = tournament.prizes.special;
    }
    
    res.status(200).json({
      success: true,
      data: {
        tournament: {
          id: tournament._id,
          title: tournament.title,
          status: tournament.status,
          prizeType: tournament.prizeType,
          prizeStructure
        },
        participants: tournament.participants,
        totalParticipants: tournament.participants.length
      }
    });
    
  } catch (error) {
    console.error('Error fetching tournament participants:', error);
    res.status(500).json({
      message: 'Error fetching tournament participants',
      error: error.message
    });
  }
});



