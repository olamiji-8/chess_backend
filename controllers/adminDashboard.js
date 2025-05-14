const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Transaction = require('../models/Transaction');
const VerificationRequest = require('../models/verification');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const generateToken = require('../utils/generateToken');
const mongoose = require('mongoose');

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
    const token = generateToken(admin);

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
        token
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

/**
 * @desc    Set an existing user as admin
 * @route   PUT /api/admin/set-admin/:userId
 * @access  Admin only
 */
exports.setUserAsAdmin = asyncHandler(async (req, res) => {
  try {
    const userId = req.params.userId;

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user role to admin
    user.role = 'admin';
    await user.save();
    const token = generateToken(user); // Fixed: was using undefined 'admin' variable

    res.status(200).json({
      success: true,
      message: `User ${user.email} has been set as admin successfully`,
      data: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        token
      }
    });
  } catch (error) {
    console.error('Error setting user as admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set user as admin',
      error: error.message
    });
  }
});

/**
 * @desc    Remove admin privileges from a user
 * @route   PUT /api/admin/remove-admin/:userId
 * @access  Admin only
 */
exports.removeAdminPrivileges = asyncHandler(async (req, res) => {
  try {
    const userId = req.params.userId;

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if trying to remove admin status from the last admin
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1 && user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove admin privileges from the last admin user'
      });
    }

    // Update user role to regular user
    user.role = 'user';
    await user.save();
    
    // Fixed: was using undefined 'admin' variable
    const token = generateToken(user);

    res.status(200).json({
      success: true,
      message: `Admin privileges removed from ${user.email} successfully`,
      data: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        token
      }
    });
  } catch (error) {
    console.error('Error removing admin privileges:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove admin privileges',
      error: error.message
    });
  }
});

/**
 * @desc    Get all admin users
 * @route   GET /api/admin/admins
 * @access  Admin only
 */
exports.getAllAdmins = asyncHandler(async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('-password')
      .sort({ createdAt: -1 });
    
    // No need to generate token here
    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins
    });
  } catch (error) {
    console.error('Error getting admin users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get admin users',
      error: error.message
    });
  }
});

/**
 * @desc    Admin login
 * @route   POST /api/auth/admin/login
 * @access  Public
 */
exports.adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate request
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password'
    });
  }

  try {
    // Find the user by email and include the password field for comparison
    const admin = await User.findOne({ email }).select('+password');

    // Check if user exists
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is an admin
    if (admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized as admin'
      });
    }

    // Check if password matches
    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token using the utility function
    const token = generateToken(admin);

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: {
        _id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        token
      }
    });
  } catch (error) {
    console.error('Error in admin login:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to login',
      error: error.message
    });
  }
});

/**
 * @desc    Check if current user is admin
 * @route   GET /api/auth/admin/check
 * @access  Private
 */
exports.checkAdminStatus = asyncHandler(async (req, res) => {
  try {
    // req.user should be set by the auth middleware
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized as admin'
      });
    }

    // User is admin
    res.status(200).json({
      success: true,
      message: 'User is admin',
      data: {
        isAdmin: true,
        userId: req.user._id,
        email: req.user.email
      }
    });
  } catch (error) {
    console.error('Error checking admin status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check admin status',
      error: error.message
    });
  }
});

/**
* @desc    Get dashboard statistics for admin
* @route   GET /api/admin/dashboard
* @access  Admin only
*/
exports.getDashboardStats = asyncHandler(async (req, res) => {
  try {
    // Users statistics
    const totalUsers = await User.countDocuments();
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const unverifiedUsers = await User.countDocuments({ isVerified: false });

    // Tournaments statistics
    const totalTournaments = await Tournament.countDocuments();
    const activeTournaments = await Tournament.countDocuments({ status: 'active' });
    const completedTournaments = await Tournament.countDocuments({ status: 'completed' });
    const upcomingTournaments = await Tournament.countDocuments({ status: 'upcoming' });

    // Transactions statistics
    const totalTransactions = await Transaction.countDocuments();
    const pendingWithdrawals = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'pending' 
    });
    const completedWithdrawals = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'completed' 
    });
    const deposits = await Transaction.countDocuments({ type: 'deposit' });

    // Recent activities
    const recentTransactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'fullName email')
      .lean();

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('fullName email createdAt role isVerified')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          admins: adminUsers,
          verified: verifiedUsers,
          unverified: unverifiedUsers
        },
        tournaments: {
          total: totalTournaments,
          active: activeTournaments,
          completed: completedTournaments,
          upcoming: upcomingTournaments
        },
        transactions: {
          total: totalTransactions,
          pendingWithdrawals,
          completedWithdrawals,
          deposits
        },
        recent: {
          transactions: recentTransactions,
          users: recentUsers
        }
      }
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard statistics',
      error: error.message
    });
  }
});

/**
 * @desc    Get all verification requests with pagination
 * @route   GET /api/admin/verifications
 * @access  Admin only
 */
exports.getAllVerifications = asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const status = req.query.status || 'pending'; // Default to pending
      const search = req.query.search || '';
  
      // Build query
      const query = { status };
      
      // Add search functionality
      if (search) {
        // We need to join with User model to search by username or email
        const users = await User.find({
          $or: [
            { fullName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { lichessUsername: { $regex: search, $options: 'i' } }
          ]
        }).select('_id');
        
        const userIds = users.map(user => user._id);
        query.user = { $in: userIds };
      }
  
      // Count total documents for pagination
      const totalDocs = await VerificationRequest.countDocuments(query);
  
      // Get verification requests with pagination
      const verifications = await VerificationRequest.find(query)
        .populate('user', 'fullName email lichessUsername profilePic')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
  
      // Get counts for each status
      const pendingCount = await VerificationRequest.countDocuments({ status: 'pending' });
      const approvedCount = await VerificationRequest.countDocuments({ status: 'approved' });
      const rejectedCount = await VerificationRequest.countDocuments({ status: 'rejected' });
  
      res.status(200).json({
        success: true,
        pagination: {
          total: totalDocs,
          page,
          limit,
          pages: Math.ceil(totalDocs / limit)
        },
        counts: {
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount,
          total: pendingCount + approvedCount + rejectedCount
        },
        data: verifications
      });
    } catch (error) {
      console.error('Error fetching verification requests:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching verification requests',
        error: error.message
      });
    }
  });
  
  /**
   * @desc    Approve a verification request
   * @route   PUT /api/admin/verifications/:requestId/approve
   * @access  Admin only
   */
  exports.approveVerification = asyncHandler(async (req, res) => {
    try {
      const requestId = req.params.requestId;
  
      if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request ID'
        });
      }
  
      const verificationRequest = await VerificationRequest.findById(requestId);
  
      if (!verificationRequest) {
        return res.status(404).json({
          success: false,
          message: 'Verification request not found'
        });
      }
  
      // Update verification request status
      verificationRequest.status = 'approved';
      verificationRequest.updatedAt = Date.now();
      await verificationRequest.save();
  
      // Update user's verification status
      const user = await User.findById(verificationRequest.user);
      if (user) {
        user.isVerified = true;
        await user.save();
  
        // Here you would typically send a notification
        // Placeholder for notification logic
        console.log(`User ${user._id} has been verified!`);
      }
  
      res.status(200).json({
        success: true,
        message: 'Verification request approved successfully',
        data: verificationRequest
      });
    } catch (error) {
      console.error('Error approving verification:', error);
      res.status(500).json({
        success: false,
        message: 'Error approving verification request',
        error: error.message
      });
    }
  });
  
  /**
   * @desc    Reject a verification request
   * @route   PUT /api/admin/verifications/:requestId/reject
   * @access  Admin only
   */
  exports.rejectVerification = asyncHandler(async (req, res) => {
    try {
      const { rejectionReason } = req.body;
      const requestId = req.params.requestId;
  
      if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request ID'
        });
      }
  
      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }
  
      const verificationRequest = await VerificationRequest.findById(requestId);
  
      if (!verificationRequest) {
        return res.status(404).json({
          success: false,
          message: 'Verification request not found'
        });
      }
  
      // Update verification request
      verificationRequest.status = 'rejected';
      verificationRequest.rejectionReason = rejectionReason;
      verificationRequest.updatedAt = Date.now();
      await verificationRequest.save();
  
      res.status(200).json({
        success: true,
        message: 'Verification request rejected successfully',
        data: verificationRequest
      });
    } catch (error) {
      console.error('Error rejecting verification:', error);
      res.status(500).json({
        success: false,
        message: 'Error rejecting verification request',
        error: error.message
      });
    }
  });
  
  /**
   * @desc    Download verification documents
   * @route   GET /api/admin/verifications/:requestId/download
   * @access  Admin only
   */
  exports.downloadVerificationData = asyncHandler(async (req, res) => {
    try {
      const requestId = req.params.requestId;
  
      if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request ID'
        });
      }
  
      const verificationRequest = await VerificationRequest.findById(requestId)
        .populate('user', 'fullName email lichessUsername')
        .lean();
  
      if (!verificationRequest) {
        return res.status(404).json({
          success: false,
          message: 'Verification request not found'
        });
      }
  
      // Create data object for download
      const verificationData = {
        requestId: verificationRequest._id,
        user: verificationRequest.user,
        fullName: verificationRequest.fullName,
        address: verificationRequest.address,
        idType: verificationRequest.idType,
        idNumber: verificationRequest.idNumber,
        status: verificationRequest.status,
        createdAt: verificationRequest.createdAt,
        updatedAt: verificationRequest.updatedAt,
        idCardImageUrl: verificationRequest.idCardImage,
        selfieImageUrl: verificationRequest.selfieImage
      };
  
      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=verification_${requestId}_data.json`);
      
      // Send the data as a downloadable file
      res.status(200).json(verificationData);
    } catch (error) {
      console.error('Error downloading verification data:', error);
      res.status(500).json({
        success: false,
        message: 'Error downloading verification data',
        error: error.message
      });
    }
  });
  
  /**
   * @desc    Get a single verification request details
   * @route   GET /api/admin/verifications/:requestId
   * @access  Admin only
   */
  exports.getVerificationDetails = asyncHandler(async (req, res) => {
    try {
      const requestId = req.params.requestId;
  
      if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request ID'
        });
      }
  
      const verificationRequest = await VerificationRequest.findById(requestId)
        .populate('user', 'fullName email lichessUsername profilePic')
        .lean();
  
      if (!verificationRequest) {
        return res.status(404).json({
          success: false,
          message: 'Verification request not found'
        });
      }
  
      res.status(200).json({
        success: true,
        data: verificationRequest
      });
    } catch (error) {
      console.error('Error getting verification details:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting verification details',
        error: error.message
      });
    }
  });

/**
 * @desc    Get all tournaments with pagination
 * @route   GET /api/admin/tournaments
 * @access  Admin only
 */
exports.getAllTournaments = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const status = req.query.status || 'all'; // 'all', 'upcoming', 'active', 'completed', 'cancelled'
      const search = req.query.search || '';
  
      // Build query
      const query = {};
      
      if (status !== 'all') {
        query.status = status;
      }
      
      // Add search functionality
      if (search) {
        query.title = { $regex: search, $options: 'i' };
      }
  
      // Count total documents for pagination
      const totalDocs = await Tournament.countDocuments(query);
  
      // Get tournaments with pagination
      const tournaments = await Tournament.find(query)
        .populate('organizer', 'fullName email lichessUsername')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
  
      // Get counts for each status
      const upcomingCount = await Tournament.countDocuments({ status: 'upcoming' });
      const activeCount = await Tournament.countDocuments({ status: 'active' });
      const completedCount = await Tournament.countDocuments({ status: 'completed' });
      const cancelledCount = await Tournament.countDocuments({ status: 'cancelled' });
  
      res.status(200).json({
        success: true,
        pagination: {
          total: totalDocs,
          page,
          limit,
          pages: Math.ceil(totalDocs / limit)
        },
        counts: {
          upcoming: upcomingCount,
          active: activeCount,
          completed: completedCount,
          cancelled: cancelledCount,
          total: totalDocs
        },
        data: tournaments
      });
    } catch (error) {
      console.error('Error fetching tournaments:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching tournaments',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Get tournament details by ID
   * @route   GET /api/admin/tournaments/:tournamentId
   * @access  Admin only
   */
  exports.getTournamentById = async (req, res) => {
    try {
      const tournamentId = req.params.tournamentId;
  
      if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid tournament ID'
        });
      }
  
      const tournament = await Tournament.findById(tournamentId)
        .populate('organizer', 'fullName email lichessUsername profilePic')
        .populate('participants', 'fullName lichessUsername profilePic');
  
      if (!tournament) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }
  
      // Get related transactions
      const transactions = await Transaction.find({
        tournament: tournamentId
      }).populate('user', 'fullName email lichessUsername').lean();
  
      res.status(200).json({
        success: true,
        data: {
          tournament,
          transactions
        }
      });
    } catch (error) {
      console.error('Error fetching tournament details:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching tournament details',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Delete tournament and refund participants
   * @route   DELETE /api/admin/tournaments/:tournamentId
   * @access  Admin only
   */
  exports.deleteTournament = async (req, res) => {
    try {
      const tournamentId = req.params.tournamentId;
  
      if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid tournament ID'
        });
      }
  
      const tournament = await Tournament.findById(tournamentId);
  
      if (!tournament) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }
  
      // Check if tournament has participants
      if (tournament.participants && tournament.participants.length > 0) {
        // If there are participants, we need to refund their entry fees
        // Create refund transactions for each participant
        for (const participantId of tournament.participants) {
          const user = await User.findById(participantId);
          
          if (user) {
            // Create refund transaction
            await Transaction.create({
              user: participantId,
              tournament: tournamentId,
              type: 'refund',
              amount: tournament.entryFee,
              reference: `REFUND-${Date.now()}-${participantId.toString().substring(0, 6)}`,
              paymentMethod: 'wallet',
              status: 'completed',
              details: {
                reason: 'Tournament deleted by admin',
                tournamentTitle: tournament.title
              }
            });
            
            // Update user wallet balance
            user.walletBalance += tournament.entryFee;
            await user.save();
            
            // Remove tournament from user's registered tournaments
            await User.findByIdAndUpdate(participantId, {
              $pull: { registeredTournaments: tournamentId }
            });
          }
        }
      }
  
      // Remove tournament from organizer's created tournaments
      await User.findByIdAndUpdate(tournament.organizer, {
        $pull: { createdTournaments: tournamentId }
      });
  
      // Delete tournament
      await Tournament.findByIdAndDelete(tournamentId);
  
      res.status(200).json({
        success: true,
        message: 'Tournament deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting tournament:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting tournament',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Update tournament status
   * @route   PUT /api/admin/tournaments/:tournamentId/status
   * @access  Admin only
   */
  exports.updateTournamentStatus = async (req, res) => {
    try {
      const tournamentId = req.params.tournamentId;
      const { status } = req.body;
  
      if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid tournament ID'
        });
      }
  
      if (!status || !['upcoming', 'active', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be one of: upcoming, active, completed, cancelled'
        });
      }
  
      const tournament = await Tournament.findById(tournamentId);
  
      if (!tournament) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }
  
      // Handle special case for cancelled status
      if (status === 'cancelled' && tournament.status !== 'cancelled') {
        // Refund entry fees to participants
        for (const participantId of tournament.participants) {
          const user = await User.findById(participantId);
          
          if (user) {
            // Create refund transaction
            await Transaction.create({
              user: participantId,
              tournament: tournamentId,
              type: 'refund',
              amount: tournament.entryFee,
              reference: `REFUND-${Date.now()}-${participantId.toString().substring(0, 6)}`,
              paymentMethod: 'wallet',
              status: 'completed',
              details: {
                reason: 'Tournament cancelled by admin',
                tournamentTitle: tournament.title
              }
            });
            
            // Update user wallet balance
            user.walletBalance += tournament.entryFee;
            await user.save();
          }
        }
      }
  
      // Update tournament status
      tournament.status = status;
      await tournament.save();
  
      res.status(200).json({
        success: true,
        message: `Tournament status updated to ${status}`,
        data: {
          tournamentId: tournament._id,
          title: tournament.title,
          status: tournament.status
        }
      });
    } catch (error) {
      console.error('Error updating tournament status:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating tournament status',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Download tournament data
   * @route   GET /api/admin/tournaments/download
   * @access  Admin only
   */
  exports.downloadTournaments = async (req, res) => {
    try {
      const status = req.query.status || 'all';
      const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
      const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
      
      // Build query
      const query = {};
      
      if (status !== 'all') {
        query.status = status;
      }
      
      // Add date range if provided
      if (startDate && endDate) {
        query.startDate = {
          $gte: startDate,
          $lte: endDate
        };
      } else if (startDate) {
        query.startDate = { $gte: startDate };
      } else if (endDate) {
        query.startDate = { $lte: endDate };
      }
  
      // Get tournament data
      const tournaments = await Tournament.find(query)
        .populate('organizer', 'fullName email lichessUsername')
        .sort({ startDate: -1 })
        .lean();
  
      // Format data for export
      const formattedTournaments = tournaments.map(t => ({
        title: t.title,
        category: t.category,
        organizer: t.organizer ? {
          fullName: t.organizer.fullName,
          email: t.organizer.email,
          lichessUsername: t.organizer.lichessUsername
        } : 'N/A',
        startDate: t.startDate,
        startTime: t.startTime,
        duration: t.duration,
        status: t.status,
        entryFee: t.entryFee,
        participantsCount: t.participants ? t.participants.length : 0,
        prizeType: t.prizeType,
        tournamentLink: t.tournamentLink,
        createdAt: t.createdAt
      }));
  
      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=tournaments_${status}_${Date.now()}.json`);
      
      // Send the data as a downloadable file
      res.status(200).json({
        totalRecords: formattedTournaments.length,
        data: formattedTournaments
      });
    } catch (error) {
      console.error('Error downloading tournament data:', error);
      res.status(500).json({
        success: false,
        message: 'Error downloading tournament data',
        error: error.message
      });
    }
  };

  /**
 * @desc    Update admin profile
 * @route   PUT /api/admin/profile
 * @access  Private/Admin
 */
exports.updateProfile = async (req, res) => {
    try {
      const userId = req.user.id; // From auth middleware
      const { fullName, email } = req.body;
  
      // Validation
      if (!fullName || !email) {
        return res.status(400).json({
          success: false,
          message: 'Please provide both fullName and email'
        });
      }
  
      // Check if email already exists (except for the current user)
      if (email) {
        const existingUser = await User.findOne({ email, _id: { $ne: userId } });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Email already in use'
          });
        }
      }
  
      // Update user
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { fullName, email },
        { new: true, runValidators: true }
      ).select('-password');
  
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
  
      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: updatedUser
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating profile',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Update admin profile picture
   * @route   PUT /api/admin/profile/picture
   * @access  Private/Admin
   */
  exports.updateProfilePicture = async (req, res) => {
    try {
      const userId = req.user.id; // From auth middleware
      const { profilePic } = req.body;
  
      if (!profilePic) {
        return res.status(400).json({
          success: false,
          message: 'Profile picture URL is required'
        });
      }
  
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { profilePic },
        { new: true }
      ).select('-password');
  
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
  
      res.status(200).json({
        success: true,
        message: 'Profile picture updated successfully',
        data: updatedUser
      });
    } catch (error) {
      console.error('Error updating profile picture:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating profile picture',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Change admin password
   * @route   PUT /api/admin/profile/password
   * @access  Private/Admin
   */
  exports.changePassword = async (req, res) => {
    try {
      const userId = req.user.id; // From auth middleware
      const { currentPassword, newPassword } = req.body;
  
      // Validation
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Please provide both current and new password'
        });
      }
  
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters long'
        });
      }
  
      // Get user with password
      const user = await User.findById(userId).select('+password');
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
  
      // Check if current password matches
      const isMatch = await user.matchPassword(currentPassword);
  
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
  
      // Update password
      user.password = newPassword;
      await user.save();
  
      res.status(200).json({
        success: true,
        message: 'Password updated successfully'
      });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({
        success: false,
        message: 'Error changing password',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Get advanced analytics
   * @route   GET /api/admin/analytics
   * @access  Private/Admin
   */
  exports.getAnalytics = async (req, res) => {
    try {
      const timeframe = req.query.timeframe || 'month'; // 'week', 'month', 'year', 'all'
      
      // Calculate date range based on timeframe
      const endDate = new Date();
      let startDate = new Date();
      
      if (timeframe === 'week') {
        startDate.setDate(endDate.getDate() - 7);
      } else if (timeframe === 'month') {
        startDate.setMonth(endDate.getMonth() - 1);
      } else if (timeframe === 'year') {
        startDate.setFullYear(endDate.getFullYear() - 1);
      } else if (timeframe === 'all') {
        startDate = new Date(0); // Beginning of time
      }
  
      // User growth analytics
      const userGrowth = await User.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);
  
      // Tournament analytics
      const tournamentAnalytics = await Tournament.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 },
            entryFeeTotal: { $sum: '$entryFee' }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);
  
      // Transaction analytics
      const transactionAnalytics = await Transaction.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              type: '$type'
            },
            count: { $sum: 1 },
            amount: { $sum: '$amount' }
          }
        },
        {
          $sort: { '_id.date': 1 }
        }
      ]);
  
      // Category distribution of tournaments
      const categoryDistribution = await Tournament.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        }
      ]);
  
      // User verification rate
      const totalUsers = await User.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      });
      
      const verifiedUsers = await User.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        isVerified: true
      });
  
      const verificationRate = totalUsers > 0 ? (verifiedUsers / totalUsers) * 100 : 0;
  
      res.status(200).json({
        success: true,
        data: {
          userGrowth,
          tournamentAnalytics,
          transactionAnalytics,
          categoryDistribution,
          verificationStats: {
            total: totalUsers,
            verified: verifiedUsers,
            rate: verificationRate.toFixed(2)
          },
          timeframe
        }
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching analytics',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Get recent activity feed
   * @route   GET /api/admin/activity
   * @access  Private/Admin
   */
  exports.getActivityFeed = async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      
      // Get recent transactions
      const transactions = await Transaction.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user', 'fullName email lichessUsername')
        .populate('tournament', 'title')
        .lean();
      
      // Get recent tournament creations
      const tournaments = await Tournament.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('organizer', 'fullName email lichessUsername')
        .lean()
        .then(tournaments => tournaments.map(t => ({
          ...t,
          activityType: 'tournament_created',
          createdAt: t.createdAt
        })));
      
      // Get recent user registrations
      const users = await User.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('fullName email lichessUsername createdAt')
        .lean()
        .then(users => users.map(u => ({
          ...u,
          activityType: 'user_registered',
          createdAt: u.createdAt
        })));
      
      // Get recent verification requests
      const verifications = await VerificationRequest.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user', 'fullName email lichessUsername')
        .lean()
        .then(verifications => verifications.map(v => ({
          ...v,
          activityType: 'verification_request',
          createdAt: v.createdAt
        })));
      
      // Combine all activities and sort by date
      const allActivities = [
        ...transactions.map(t => ({
          ...t,
          activityType: `transaction_${t.type}`,
          timestamp: t.createdAt
        })),
        ...tournaments.map(t => ({
          ...t,
          activityType: 'tournament_created',
          timestamp: t.createdAt
        })),
        ...users.map(u => ({
          ...u,
          activityType: 'user_registered',
          timestamp: u.createdAt
        })),
        ...verifications.map(v => ({
          ...v,
          activityType: `verification_${v.status}`,
          timestamp: v.createdAt
        }))
      ];
      
      // Sort by timestamp descending and limit results
      const sortedActivities = allActivities
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
  
      res.status(200).json({
        success: true,
        data: sortedActivities
      });
    } catch (error) {
      console.error('Error fetching activity feed:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching activity feed',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Generate monthly report
   * @route   GET /api/admin/reports/monthly
   * @access  Private/Admin
   */
  exports.getMonthlyReport = async (req, res) => {
    try {
      const month = parseInt(req.query.month) || new Date().getMonth() + 1; // 1-12
      const year = parseInt(req.query.year) || new Date().getFullYear();
      
      // Create date range for the requested month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59); // Last day of month
      
      // User statistics
      const newUsers = await User.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      });
      
      const verifiedUsers = await User.countDocuments({
        isVerified: true,
        createdAt: { $gte: startDate, $lte: endDate }
      });
      
      // Tournament statistics
      const newTournaments = await Tournament.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      });
      
      const completedTournaments = await Tournament.countDocuments({
        status: 'completed',
        startDate: { $gte: startDate, $lte: endDate }
      });
      
      // Transaction statistics
      const transactionStats = await Transaction.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);
      
      // Format transaction stats
      const formattedTransactions = {};
      let totalRevenue = 0;
      
      transactionStats.forEach(stat => {
        formattedTransactions[stat._id] = {
          count: stat.count,
          totalAmount: stat.totalAmount
        };
        
        // Calculate revenue
        if (['deposit', 'tournament_entry', 'tournament_funding'].includes(stat._id)) {
          totalRevenue += stat.totalAmount;
        }
        
        if (['withdrawal', 'prize_payout', 'refund'].includes(stat._id)) {
          totalRevenue -= stat.totalAmount;
        }
      });
      
      // Category-wise tournament distribution
      const categoryDistribution = await Tournament.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        }
      ]);
      
      // Daily statistics for charts
      const dailyStats = await Transaction.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              type: '$type'
            },
            count: { $sum: 1 },
            amount: { $sum: '$amount' }
          }
        },
        {
          $sort: { '_id.date': 1 }
        }
      ]);
  
      res.status(200).json({
        success: true,
        data: {
          period: {
            month,
            year,
            startDate,
            endDate
          },
          users: {
            new: newUsers,
            verified: verifiedUsers,
            verificationRate: newUsers > 0 ? (verifiedUsers / newUsers * 100).toFixed(2) : 0
          },
          tournaments: {
            new: newTournaments,
            completed: completedTournaments,
            categoryDistribution
          },
          transactions: formattedTransactions,
          financials: {
            totalRevenue,
            dailyStats
          }
        }
      });
    } catch (error) {
      console.error('Error generating monthly report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating monthly report',
        error: error.message
      });
    }
  };
  
/**
 * @desc    Get all players with stats and pagination
 * @route   GET /api/admin/players
 * @access  Private/Admin
 */
exports.getAllPlayers = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const status = req.query.status; // 'verified', 'unverified', 'declined'
      const search = req.query.search || '';
  
      // Build match criteria
      const matchCriteria = { role: 'user' };
      
      if (status === 'verified') {
        matchCriteria.isVerified = true;
      } else if (status === 'unverified') {
        matchCriteria.isVerified = false;
      } else if (status === 'declined') {
        // For declined, we need to check verification requests
        const declinedUserIds = await VerificationRequest.find({ status: 'rejected' })
          .distinct('user');
        matchCriteria._id = { $in: declinedUserIds };
      }
      
      // Add search functionality
      if (search) {
        matchCriteria.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { lichessUsername: { $regex: search, $options: 'i' } }
        ];
      }
  
      // Count total documents for pagination
      const totalDocs = await User.countDocuments(matchCriteria);
  
      // Get players with pagination
      const players = await User.aggregate([
        {
          $match: matchCriteria
        },
        {
          $project: {
            fullName: 1,
            email: 1,
            profilePic: 1,
            lichessUsername: 1,
            isVerified: 1,
            createdAt: 1,
            registeredTournamentsCount: { $size: { $ifNull: ['$registeredTournaments', []] } },
            createdTournamentsCount: { $size: { $ifNull: ['$createdTournaments', []] } },
            walletBalance: 1,
            phoneNumber: 1
          }
        },
        {
          $sort: { createdAt: -1 }
        },
        {
          $skip: skip
        },
        {
          $limit: limit
        }
      ]);
  
      // Get counts for each status
      const verifiedCount = await User.countDocuments({ role: 'user', isVerified: true });
      const unverifiedCount = await User.countDocuments({ role: 'user', isVerified: false });
      const declinedCount = await VerificationRequest.countDocuments({ status: 'rejected' });
  
      res.status(200).json({
        success: true,
        pagination: {
          total: totalDocs,
          page,
          limit,
          pages: Math.ceil(totalDocs / limit)
        },
        counts: {
          verified: verifiedCount,
          unverified: unverifiedCount,
          declined: declinedCount,
          total: totalDocs
        },
        data: players
      });
    } catch (error) {
      console.error('Error fetching players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching players',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Get single player detailed stats
   * @route   GET /api/admin/players/:userId
   * @access  Private/Admin
   */
  exports.getPlayerDetails = async (req, res) => {
    try {
      const userId = req.params.userId;
  
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }
  
      const user = await User.findById(userId).lean();
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
  
      // Get created tournaments
      const createdTournaments = await Tournament.find({
        organizer: userId
      }).select('title startDate status participants category').lean();
  
      // Get registered tournaments
      const registeredTournaments = await Tournament.find({
        participants: userId
      }).select('title startDate status category').lean();
  
      // Get transaction history
      const transactions = await Transaction.find({
        user: userId
      }).sort({ createdAt: -1 }).lean();
  
      // Get verification status history
      const verificationHistory = await VerificationRequest.find({
        user: userId
      }).sort({ updatedAt: -1 }).lean();
  
      res.status(200).json({
        success: true,
        data: {
          user: {
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            profilePic: user.profilePic,
            lichessUsername: user.lichessUsername,
            phoneNumber: user.phoneNumber,
            isVerified: user.isVerified,
            walletBalance: user.walletBalance,
            createdAt: user.createdAt,
            bankDetails: user.bankDetails || {}
          },
          stats: {
            createdTournaments: createdTournaments,
            registeredTournaments: registeredTournaments,
            totalCreated: createdTournaments.length,
            totalRegistered: registeredTournaments.length
          },
          transactions: transactions,
          verificationHistory: verificationHistory
        }
      });
    } catch (error) {
      console.error('Error fetching player details:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching player details',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Download player data
   * @route   GET /api/admin/players/:userId/download
   * @access  Private/Admin
   */
  exports.downloadPlayerData = async (req, res) => {
    try {
      const userId = req.params.userId;
  
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }
  
      const user = await User.findById(userId).lean();
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
  
      // Get all user-related data
      const createdTournaments = await Tournament.find({
        organizer: userId
      }).select('title startDate status participants category').lean();
  
      const registeredTournaments = await Tournament.find({
        participants: userId
      }).select('title startDate status category').lean();
  
      const transactions = await Transaction.find({
        user: userId
      }).sort({ createdAt: -1 }).lean();
  
      const verificationHistory = await VerificationRequest.find({
        user: userId
      }).sort({ updatedAt: -1 }).lean();
  
      // Create data object for download
      const userData = {
        personalInfo: {
          fullName: user.fullName,
          email: user.email,
          lichessUsername: user.lichessUsername,
          phoneNumber: user.phoneNumber,
          isVerified: user.isVerified,
          walletBalance: user.walletBalance,
          createdAt: user.createdAt,
          bankDetails: user.bankDetails || {}
        },
        tournaments: {
          created: createdTournaments,
          registered: registeredTournaments
        },
        transactions: transactions,
        verificationHistory: verificationHistory
      };
  
      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=user_${userId}_data.json`);
      
      // Send the data as a downloadable file
      res.status(200).json(userData);
    } catch (error) {
      console.error('Error downloading player data:', error);
      res.status(500).json({
        success: false,
        message: 'Error downloading player data',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Download profile picture
   * @route   GET /api/admin/players/:userId/profilepic
   * @access  Private/Admin
   */
  exports.downloadProfilePicture = async (req, res) => {
    try {
      const userId = req.params.userId;
  
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }
  
      const user = await User.findById(userId).select('profilePic').lean();
  
      if (!user || !user.profilePic) {
        return res.status(404).json({
          success: false,
          message: 'User or profile picture not found'
        });
      }
  
      // This is a redirect to the actual image URL
      // For security, you might want to download the image and serve it directly
      res.redirect(user.profilePic);
    } catch (error) {
      console.error('Error fetching profile picture:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching profile picture',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Change user verification status
   * @route   PUT /api/admin/players/:userId/status
   * @access  Private/Admin
   */
  exports.updatePlayerStatus = async (req, res) => {
    try {
      const userId = req.params.userId;
      const { status, reason } = req.body;
  
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }
  
      if (!status || !['verified', 'unverified', 'declined'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be one of: verified, unverified, declined'
        });
      }
  
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
  
      // Update user verification status
      if (status === 'verified') {
        user.isVerified = true;
        await user.save();
        
        // Update any pending verification requests
        await VerificationRequest.updateMany(
          { user: userId, status: 'pending' },
          { status: 'approved', updatedAt: Date.now() }
        );
      } else if (status === 'unverified') {
        user.isVerified = false;
        await user.save();
      } else if (status === 'declined') {
        user.isVerified = false;
        await user.save();
        
        // Update any pending verification requests
        if (!reason) {
          return res.status(400).json({
            success: false,
            message: 'Reason is required for declining verification'
          });
        }
        
        await VerificationRequest.updateMany(
          { user: userId, status: 'pending' },
          { 
            status: 'rejected', 
            rejectionReason: reason,
            updatedAt: Date.now() 
          }
        );
      }
  
      res.status(200).json({
        success: true,
        message: `User status updated to ${status}`,
        data: {
          userId: user._id,
          isVerified: user.isVerified,
          status
        }
      });
    } catch (error) {
      console.error('Error updating user status:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating user status',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Ban a player (disable account)
   * @route   PUT /api/admin/players/:userId/ban
   * @access  Private/Admin
   */
  exports.banPlayer = async (req, res) => {
    try {
      const userId = req.params.userId;
      const { reason } = req.body;
  
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }
  
      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Ban reason is required'
        });
      }
  
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
  
      // Add a new field to track banned status
      user.isBanned = true;
      user.banReason = reason;
      user.bannedAt = Date.now();
      await user.save();
  
      res.status(200).json({
        success: true,
        message: 'User has been banned',
        data: {
          userId: user._id,
          isBanned: user.isBanned,
          banReason: user.banReason,
          bannedAt: user.bannedAt
        }
      });
    } catch (error) {
      console.error('Error banning user:', error);
      res.status(500).json({
        success: false,
        message: 'Error banning user',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Unban a player
   * @route   PUT /api/admin/players/:userId/unban
   * @access  Private/Admin
   */
  exports.unbanPlayer = async (req, res) => {
    try {
      const userId = req.params.userId;
  
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }
  
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
  
      user.isBanned = false;
      user.banReason = undefined;
      user.bannedAt = undefined;
      await user.save();
  
      res.status(200).json({
        success: true,
        message: 'User has been unbanned',
        data: {
          userId: user._id,
          isBanned: user.isBanned
        }
      });
    } catch (error) {
      console.error('Error unbanning user:', error);
      res.status(500).json({
        success: false,
        message: 'Error unbanning user',
        error: error.message
      });
    }
  };

  /**
 * @desc    Get withdrawal statistics - counts for different statuses
 * @route   GET /api/admin/withdrawals/stats
 * @access  Private/Admin
 */
exports.getWithdrawalStats = async (req, res) => {
    try {
      // Get counts for each withdrawal status
      const totalCount = await Transaction.countDocuments({ 
        type: 'withdrawal' 
      });
      
      const pendingCount = await Transaction.countDocuments({ 
        type: 'withdrawal', 
        status: 'pending' 
      });
      
      const completedCount = await Transaction.countDocuments({ 
        type: 'withdrawal', 
        status: 'completed' 
      });
      
      const declinedCount = await Transaction.countDocuments({ 
        type: 'withdrawal', 
        status: 'declined' 
      });
  
      // Get total withdrawal amount stats
      const totalAmountStats = await Transaction.aggregate([
        { $match: { type: 'withdrawal' } },
        { $group: { 
            _id: '$status', 
            totalAmount: { $sum: '$amount' } 
          } 
        }
      ]);
  
      // Format total amounts by status
      const amountByStatus = {};
      totalAmountStats.forEach(stat => {
        amountByStatus[stat._id] = stat.totalAmount;
      });
  
      // Calculate total amount of all withdrawals
      const totalWithdrawnAmount = totalAmountStats.reduce((sum, stat) => {
        return sum + (stat._id === 'completed' ? stat.totalAmount : 0);
      }, 0);
  
      // Get recent trend - withdrawals by day for the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const dailyTrend = await Transaction.aggregate([
        { 
          $match: { 
            type: 'withdrawal',
            createdAt: { $gte: sevenDaysAgo } 
          } 
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              status: '$status'
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        },
        { $sort: { '_id.date': 1 } }
      ]);
  
      res.status(200).json({
        success: true,
        data: {
          counts: {
            total: totalCount,
            pending: pendingCount,
            completed: completedCount,
            declined: declinedCount
          },
          amounts: {
            total: totalWithdrawnAmount,
            byStatus: amountByStatus
          },
          trend: dailyTrend
        }
      });
    } catch (error) {
      console.error('Error fetching withdrawal stats:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching withdrawal statistics',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Get all withdrawals with pagination and filtering
   * @route   GET /api/admin/withdrawals
   * @access  Private/Admin
   */
  exports.getAllWithdrawals = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const status = req.query.status; // 'pending', 'completed', 'declined', or undefined for all
      const search = req.query.search || '';
      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
      
      // Build query
      const query = { type: 'withdrawal' };
      
      // Add status filter if provided
      if (status && ['pending', 'completed', 'declined'].includes(status)) {
        query.status = status;
      }
      
      // Add search functionality
      if (search) {
        // We'll need to look up users by the search term, then find transactions for those users
        const users = await User.find({
          $or: [
            { fullName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { lichessUsername: { $regex: search, $options: 'i' } }
          ]
        }).select('_id');
        
        const userIds = users.map(user => user._id);
        
        // Add user IDs to the query
        if (userIds.length > 0) {
          query.user = { $in: userIds };
        } else {
          // If no users match the search, return empty results
          return res.status(200).json({
            success: true,
            pagination: {
              total: 0,
              page,
              limit,
              pages: 0
            },
            counts: {
              pending: 0,
              completed: 0,
              declined: 0,
              total: 0
            },
            data: []
          });
        }
      }
      
      // Count total documents for pagination
      const totalDocs = await Transaction.countDocuments(query);
      
      // Create sort object
      const sort = {};
      sort[sortBy] = sortOrder;
      
      // Get withdrawals with user details using aggregation
      const withdrawals = await Transaction.aggregate([
        { $match: query },
        { $sort: sort },
        { $skip: skip },
        { $limit: limit },
        { 
          $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'userDetails'
          }
        },
        { $unwind: '$userDetails' },
        {
          $project: {
            _id: 1,
            amount: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            notes: 1,
            rejectionReason: 1,
            reference: 1,
            bankDetails: 1,
            'userDetails._id': 1,
            'userDetails.fullName': 1,
            'userDetails.email': 1,
            'userDetails.lichessUsername': 1,
            'userDetails.walletBalance': 1
          }
        }
      ]);
  
      // Get counts for each status
      const pendingCount = await Transaction.countDocuments({ type: 'withdrawal', status: 'pending' });
      const completedCount = await Transaction.countDocuments({ type: 'withdrawal', status: 'completed' });
      const declinedCount = await Transaction.countDocuments({ type: 'withdrawal', status: 'declined' });
  
      res.status(200).json({
        success: true,
        pagination: {
          total: totalDocs,
          page,
          limit,
          pages: Math.ceil(totalDocs / limit)
        },
        counts: {
          pending: pendingCount,
          completed: completedCount,
          declined: declinedCount,
          total: totalDocs
        },
        data: withdrawals
      });
    } catch (error) {
      console.error('Error fetching withdrawals:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching withdrawals',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Get withdrawal by ID
   * @route   GET /api/admin/withdrawals/:id
   * @access  Private/Admin
   */
  exports.getWithdrawalById = async (req, res) => {
    try {
      const withdrawalId = req.params.id;
  
      if (!mongoose.Types.ObjectId.isValid(withdrawalId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid withdrawal ID'
        });
      }
  
      const withdrawal = await Transaction.findOne({
        _id: withdrawalId,
        type: 'withdrawal'
      });
  
      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          message: 'Withdrawal not found'
        });
      }
  
      // Get user details
      const user = await User.findById(withdrawal.user).select(
        'fullName email lichessUsername walletBalance bankDetails'
      );
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User associated with this withdrawal not found'
        });
      }
  
      // Get withdrawal history for this user
      const withdrawalHistory = await Transaction.find({
        user: withdrawal.user,
        type: 'withdrawal'
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('amount status createdAt reference');
  
      res.status(200).json({
        success: true,
        data: {
          withdrawal,
          user,
          withdrawalHistory
        }
      });
    } catch (error) {
      console.error('Error fetching withdrawal details:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching withdrawal details',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Update withdrawal status
   * @route   PUT /api/admin/withdrawals/:id/status
   * @access  Private/Admin
   */
  exports.updateWithdrawalStatus = async (req, res) => {
    try {
      const withdrawalId = req.params.id;
      const { status, notes } = req.body;
  
      if (!mongoose.Types.ObjectId.isValid(withdrawalId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid withdrawal ID'
        });
      }
  
      if (!status || !['pending', 'completed', 'declined'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be one of: pending, completed, declined'
        });
      }
  
      const withdrawal = await Transaction.findOne({
        _id: withdrawalId,
        type: 'withdrawal'
      });
  
      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          message: 'Withdrawal not found'
        });
      }
  
      // If declining, we need a reason
      if (status === 'declined' && (!notes || notes.trim() === '')) {
        return res.status(400).json({
          success: false,
          message: 'A reason is required when declining a withdrawal'
        });
      }
  
      // If we're changing from pending to completed or declined, handle wallet balance
      const user = await User.findById(withdrawal.user);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User associated with this withdrawal not found'
        });
      }
  
      // Get the original status for the change tracking
      const originalStatus = withdrawal.status;
  
      // If the status is changing from pending to declined, refund the amount to user's wallet
      if (originalStatus === 'pending' && status === 'declined') {
        user.walletBalance += withdrawal.amount;
        await user.save();
      }
  
      // If the status is changing from declined to pending or completed, deduct the amount from wallet
      // (but only if it wasn't already taken out previously)
      if (originalStatus === 'declined' && (status === 'pending' || status === 'completed')) {
        // Only deduct if user has sufficient balance
        if (user.walletBalance >= withdrawal.amount) {
          user.walletBalance -= withdrawal.amount;
          await user.save();
        } else {
          return res.status(400).json({
            success: false,
            message: 'User has insufficient balance for this withdrawal'
          });
        }
      }
  
      // Update the withdrawal status
      withdrawal.status = status;
      
      // Add notes if provided
      if (notes) {
        withdrawal.notes = notes;
        if (status === 'declined') {
          withdrawal.rejectionReason = notes;
        }
      }
      
      // Add reference number if status is completed
      if (status === 'completed' && !withdrawal.reference) {
        withdrawal.reference = `WD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      }
      
      // Update the timestamp
      withdrawal.updatedAt = Date.now();
      
      // Save the withdrawal
      await withdrawal.save();
  
      res.status(200).json({
        success: true,
        message: `Withdrawal status updated to ${status}`,
        data: {
          withdrawal,
          user: {
            _id: user._id,
            fullName: user.fullName,
            walletBalance: user.walletBalance
          }
        }
      });
    } catch (error) {
      console.error('Error updating withdrawal status:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating withdrawal status',
        error: error.message
      });
    }
  };
  
  /**
   * @desc    Download all withdrawals data
   * @route   GET /api/admin/withdrawals/download
   * @access  Private/Admin
   */
  exports.downloadWithdrawals = async (req, res) => {
    try {
      const status = req.query.status; // 'pending', 'completed', 'declined', or undefined for all
      const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
      const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
      
      // Build query
      const query = { type: 'withdrawal' };
      
      // Add status filter if provided
      if (status && ['pending', 'completed', 'declined'].includes(status)) {
        query.status = status;
      }
      
      // Add date range filter if provided
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = startDate;
        }
        if (endDate) {
          // Set end date to the end of the day
          endDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = endDate;
        }
      }
      
      // Get withdrawals with user details
      const withdrawals = await Transaction.aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        { 
          $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'userDetails'
          }
        },
        { $unwind: '$userDetails' },
        {
          $project: {
            amount: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            notes: 1,
            rejectionReason: 1,
            reference: 1,
            bankDetails: 1,
            'user.fullName': '$userDetails.fullName',
            'user.email': '$userDetails.email',
            'user.lichessUsername': '$userDetails.lichessUsername',
            'user.walletBalance': '$userDetails.walletBalance'
          }
        }
      ]);
  
      // Format data for download
      const formattedData = withdrawals.map(w => ({
        fullName: w.user.fullName,
        email: w.user.email,
        lichessUsername: w.user.lichessUsername,
        amount: w.amount,
        status: w.status,
        walletBalance: w.user.walletBalance,
        reference: w.reference || 'N/A',
        bankName: w.bankDetails?.bankName || 'N/A',
        accountNumber: w.bankDetails?.accountNumber || 'N/A',
        accountName: w.bankDetails?.accountName || 'N/A',
        createdAt: new Date(w.createdAt).toLocaleString(),
        updatedAt: new Date(w.updatedAt).toLocaleString(),
        notes: w.notes || 'N/A',
        rejectionReason: w.rejectionReason || 'N/A'
      }));
  
      // Set filename based on filters
      let filename = 'withdrawals';
      if (status) filename += `_${status}`;
      if (startDate && endDate) {
        filename += `_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}`;
      } else if (startDate) {
        filename += `_from_${startDate.toISOString().split('T')[0]}`;
      } else if (endDate) {
        filename += `_until_${endDate.toISOString().split('T')[0]}`;
      }
      filename += '.json';
  
      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      
      // Send the data as a downloadable file
      res.status(200).json(formattedData);
    } catch (error) {
      console.error('Error downloading withdrawals data:', error);
      res.status(500).json({
        success: false,
        message: 'Error downloading withdrawals data',
        error: error.message
      });
    }
  };