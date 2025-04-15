const passport = require('passport');
const asyncHandler = require('express-async-handler');

/**
 * Combined middleware for authentication and admin role verification
 * First authenticates the user with JWT, then verifies admin role
 */
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

/**
 * Middleware to verify admin role
 * Assumes authentication has already been performed
 */
exports.adminOnly = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'No authentication token, authorization denied' });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Not authorized as admin' });
  }
  
  next();
});

/**
 * Combined middleware that performs both authentication and admin verification
 */
exports.admin = [exports.protect, exports.adminOnly];

module.exports = exports;