// utils/generateToken.js

const jwt = require('jsonwebtoken');

/**
 * Generate a JWT token with consistent payload structure
 * @param {Object} user - User object from database
 * @returns {String} JWT token
 */
const generateToken = (user) => {
  // Create a consistent payload structure used throughout the app
  const payload = {
    // Include both formats for backward compatibility
    id: user._id,
    userId: user._id,
    email: user.email,
    fullName: user.fullName,
    role: user.role
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'fallbacksecret',
    { expiresIn: '30d' }
  );
};

module.exports = generateToken;