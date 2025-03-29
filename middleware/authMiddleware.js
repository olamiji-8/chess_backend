const passport = require('passport');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');

// Middleware to protect routes with JWT
exports.protect = asyncHandler(async (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      return res.status(500).json({ message: 'Internal server error during authentication' });
    }
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Not authorized, authentication failed',
        details: info ? info.message : 'Invalid or expired token'
      });
    }
    
    req.user = user;
    next();
  })(req, res, next);
});

// Admin Middleware
exports.adminOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as admin' });
  }
});

exports.admin = exports.adminOnly;