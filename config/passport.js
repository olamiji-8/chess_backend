const passport = require('passport');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const User = require('../models/User');
require('dotenv').config();

const SECRET_KEY = process.env.JWT_SECRET || 'fallbacksecret';

// JWT Strategy for token authentication
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: SECRET_KEY,
  passReqToCallback: true // Add request to callback for better debugging
};

passport.use(new JwtStrategy(jwtOptions, async (req, payload, done) => {
  try {
    // Log payload for debugging
    console.log('JWT Payload:', payload);
    
    // Check for user ID in payload (handle both formats)
    const userId = payload.id || payload.userId;
    
    if (!userId) {
      console.error('No user ID found in JWT payload');
      return done(null, false, { message: 'Invalid token structure' });
    }
    
    // Find user by ID
    const user = await User.findById(userId);
    
    if (!user) {
      console.error(`User with ID ${userId} not found`);
      return done(null, false, { message: 'User not found' });
    }
    
    console.log(`User authenticated: ${user.email} (${user._id}), Role: ${user.role}`);
    return done(null, user);
  } catch (error) {
    console.error('JWT Authentication Error:', error);
    return done(error, false);
  }
}));

module.exports = passport;