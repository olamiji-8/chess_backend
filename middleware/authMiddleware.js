const User = require('../models/User');
const asyncHandler = require('express-async-handler');

exports.protect = asyncHandler(async (req, res, next) => {
  // Check if user is logged in via session
  if (req.session && req.session.userId && req.session.isLoggedIn) {
    try {
      // Check if user still exists in database
      const user = await User.findById(req.session.userId);
      
      if (!user) {
        // User no longer exists in database
        req.session.destroy();
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }
      
      // User exists, attach to request object
      req.user = user;
      next();
    } catch (error) {
      console.error('Session authentication error:', error);
      return res.status(401).json({ message: 'Not authorized, session invalid' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no session' });
  }
});

// Check if user is admin
exports.adminOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as admin' });
  }
});

exports.admin = exports.adminOnly;