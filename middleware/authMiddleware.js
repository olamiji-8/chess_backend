const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware to authenticate users based on JWT token
 * This middleware verifies the token and attaches the user to the request object
 */
exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Get token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('Token found in request');
    }
    
    // Check if token exists
    if (!token) {
      console.log('No token found in request');
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }
    
    try {
      // Verify token using JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallbacksecret');
      console.log('Token decoded, user ID:', decoded.id || decoded.userId);
      
      // Find user by id - use either id or userId from token
      const userId = decoded.id || decoded.userId;
      const user = await User.findById(userId).select('-password');
      
      if (!user) {
        console.log('User not found with ID:', userId);
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Attach user to request object so next middleware can use it
      req.user = user;
      console.log('User authenticated successfully:', user._id);
      next();
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Middleware to restrict access to admin users only
 * MUST be used after authenticate middleware
 */
exports.adminOnly = async (req, res, next) => {
  try {
    // Make sure req.user exists (set by authenticate middleware)
    if (!req.user) {
      console.log('Admin check failed: No authenticated user');
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }
    
    // Check if user role is admin
    console.log('Checking admin permissions for user:', req.user._id);
    if (req.user.role !== 'admin') {
      console.log('User is not admin:', req.user._id);
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    console.log('Admin access granted for user:', req.user._id);
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};