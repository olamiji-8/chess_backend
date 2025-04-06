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
        password
      } = req.body;
      
      // Validate required fields
      if (!title || !category || !rules || !startDate || !startTime || !duration || !prizeType || !fundingMethod) {
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
            !fundingMethod ? 'fundingMethod' : null
          ].filter(Boolean)
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
            first: 0,
            second: 0,
            third: 0,
            fourth: 0,
            fifth: 0,
            additional: []
          }
        };
        
        // If prizes.fixed exists and is an object, try to extract values
        if (prizes && prizes.fixed && typeof prizes.fixed === 'object') {
          console.log('Prizes fixed object:', JSON.stringify(prizes.fixed));
          
          // Parse numeric values from the prizes.fixed object
          if (prizes.fixed.first) normalizedPrizes.fixed.first = parseFloat(prizes.fixed.first) || 0;
          if (prizes.fixed.second) normalizedPrizes.fixed.second = parseFloat(prizes.fixed.second) || 0;
          if (prizes.fixed.third) normalizedPrizes.fixed.third = parseFloat(prizes.fixed.third) || 0;
          if (prizes.fixed.fourth) normalizedPrizes.fixed.fourth = parseFloat(prizes.fixed.fourth) || 0;
          if (prizes.fixed.fifth) normalizedPrizes.fixed.fifth = parseFloat(prizes.fixed.fifth) || 0;
          
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
            first: 0,
            second: 0,
            third: 0,
            fourth: 0,
            fifth: 0,
            additional: []
          }
        };
        
        // Similar parsing for percentage prizes
        if (prizes && prizes.percentage && typeof prizes.percentage === 'object') {
          if (prizes.percentage.basePrizePool) normalizedPrizes.percentage.basePrizePool = parseFloat(prizes.percentage.basePrizePool) || 0;
          if (prizes.percentage.first) normalizedPrizes.percentage.first = parseFloat(prizes.percentage.first) || 0;
          if (prizes.percentage.second) normalizedPrizes.percentage.second = parseFloat(prizes.percentage.second) || 0;
          if (prizes.percentage.third) normalizedPrizes.percentage.third = parseFloat(prizes.percentage.third) || 0;
          if (prizes.percentage.fourth) normalizedPrizes.percentage.fourth = parseFloat(prizes.percentage.fourth) || 0;
          if (prizes.percentage.fifth) normalizedPrizes.percentage.fifth = parseFloat(prizes.percentage.fifth) || 0;
          
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
          totalPrizePool = normalizedPrizes.fixed.first + 
                          normalizedPrizes.fixed.second + 
                          normalizedPrizes.fixed.third + 
                          normalizedPrizes.fixed.fourth + 
                          normalizedPrizes.fixed.fifth;
                          
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

      // Generate unique tournament link
      const tournamentLink = `https://lichess.org/tournament/${uuidv4()}`;

      // Parse duration as number in hours and convert to milliseconds
      // 1 hour = 3600000 milliseconds
      const durationInHours = parseFloat(duration) || 3; // Default to 3 hours if invalid
      const durationInMs = durationInHours * 3600000;
      
      // Parse entry fee as number
      const parsedEntryFee = parseFloat(entryFee) || 0; // Default to 0 if invalid

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
          tournamentLink,
          password: password || null
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

// @desc    Get all tournaments with pagination and filters
// @route   GET /api/tournaments
// @access  Public
exports.getTournaments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const category = req.query.category;
  const status = req.query.status || 'upcoming'; // Change default from 'active' to 'upcoming'
  
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
  
  // Filter by status unless 'all' is specified
  if (status && status !== 'all') {
    query.status = status;
  }

    console.log('Query filters:', query);

    // First check if any tournaments exist at all (regardless of filters)
    const allTournamentsCount = await Tournament.countDocuments({});
    console.log('Total tournaments in database (no filters):', allTournamentsCount);

    const total = await Tournament.countDocuments(query);
    console.log('Tournaments matching query:', total);
    
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
    
    console.log(`Retrieved ${tournaments.length} tournaments`);
    
    // Convert duration from milliseconds to hours for client display
    const formattedTournaments = tournaments.map(tournament => {
      const tournamentObj = tournament.toObject();
      tournamentObj.durationInHours = tournament.duration / 3600000;
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