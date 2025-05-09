// authMiddleware.js
const passport = require('passport');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const User = require('../models/User'); // Update the path to your User model
const asyncHandler = require('express-async-handler');

/**
 * Configure Passport JWT strategy
 * @param {Object} passport - Passport instance
 */
exports.configureJWT = () => {
  const options = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET || 'your_jwt_secret',
    // Increase debugging
    passReqToCallback: true
  };

  passport.use(
    new JwtStrategy(options, async (req, jwtPayload, done) => {
      try {
        // Log for debugging
        console.log('JWT Payload:', jwtPayload);
        
        // Ensure the JWT payload has a user ID
        if (!jwtPayload.id && !jwtPayload._id) {
          console.error('Missing user ID in JWT payload');
          return done(null, false, { message: 'Invalid token: missing user ID' });
        }
        
        // Find user by ID
        const userId = jwtPayload.id || jwtPayload._id;
        const user = await User.findById(userId).select('+role');
        
        if (!user) {
          console.error(`User with ID ${userId} not found`);
          return done(null, false, { message: 'User not found' });
        }
        
        // Log found user for debugging
        console.log(`User found: ${user.email}, Role: ${user.role}`);
        
        return done(null, user);
      } catch (error) {
        console.error('JWT Strategy Error:', error);
        return done(error, false);
      }
    })
  );
};

/**
 * Middleware to protect routes - verify JWT token with detailed logging
 * @access  Private
 */
exports.protect = asyncHandler(async (req, res, next) => {
  // Log the incoming authorization header for debugging
  console.log('Auth Header:', req.headers.authorization);
  
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      console.error('Passport Auth Error:', err);
      return res.status(500).json({ 
        success: false,
        message: 'Internal server error during authentication',
        error: err.message
      });
    }
    
    if (!user) {
      console.error('Authentication Failed:', info ? info.message : 'Unknown reason');
      return res.status(401).json({
        success: false,
        message: 'Not authorized, authentication failed',
        details: info ? info.message : 'Invalid or expired token'
      });
    }
    
    // Log successful authentication
    console.log(`User authenticated: ${user.email} (${user._id}), Role: ${user.role}`);
    
    req.user = user;
    next();
  })(req, res, next);
});

/**
 * Middleware to restrict routes to admin users only with detailed logging
 * @access  Private/Admin
 */
exports.adminOnly = asyncHandler(async (req, res, next) => {
  console.log('Checking admin permissions for user:', req.user ? req.user._id : 'No user');
  
  if (!req.user) {
    console.error('Admin check failed: No authenticated user');
    return res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }

  console.log(`User role: ${req.user.role}`);
  
  if (req.user.role !== 'admin') {
    console.error(`Admin access denied for user ${req.user._id}: Role is ${req.user.role}`);
    return res.status(403).json({
      success: false,
      message: 'Not authorized as admin'
    });
  }

  console.log(`Admin access granted for user ${req.user._id}`);
  next();
});

module.exports = exports;