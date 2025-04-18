const User = require('../models/User');
const bcrypt = require('bcryptjs');

/**
 * Verifies a user's PIN code
 * @param {string} userId - The user's ID
 * @param {string} pin - The PIN to verify
 * @returns {Object} - Result with success boolean and message
 */
// exports.verifyUserPin = async (userId, pin) => {
//   try {
//     // Check if PIN is provided
//     if (!pin) {
//       return {
//         success: false,
//         message: 'PIN is required'
//       };
//     }
    
//     // Validate PIN format
//     if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
//       return {
//         success: false,
//         message: 'PIN must be exactly 4 digits'
//       };
//     }
    
//     // Find user with PIN field
//     const user = await User.findById(userId).select('+pin');
    
//     if (!user) {
//       return {
//         success: false,
//         message: 'User not found'
//       };
//     }
    
//     // Check if user has set a PIN
//     if (!user.pin) {
//       return {
//         success: false,
//         message: 'PIN not set. Please set your PIN first.'
//       };
//     }
    
//     // Compare PIN
//     const isMatch = await bcrypt.compare(pin, user.pin);
    
//     if (!isMatch) {
//       return {
//         success: false,
//         message: 'Incorrect PIN'
//       };
//     }
    
//     return {
//       success: true,
//       message: 'PIN verified successfully'
//     };
//   } catch (error) {
//     console.error('PIN verification error:', error);
//     return {
//       success: false,
//       message: 'Error verifying PIN',
//       error: error.message
//     };
//   }
// };


const verifyUserPin = async (userId, pin) => {
  try {
    // Get user with PIN field (which is normally excluded)
    const user = await User.findById(userId).select('+pin');
    
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    
    if (!user.pin) {
      return { success: false, message: 'PIN not set. Please set up your PIN first.' };
    }
    
    const isMatch = await bcrypt.compare(pin, user.pin);
    if (!isMatch) {
      return { success: false, message: 'Incorrect PIN' };
    }
    
    // Return success but NOT the user object with the PIN
    // This is important for security
    return { success: true, userId: user._id };
  } catch (error) {
    console.error('PIN verification error:', error);
    return { success: false, message: 'PIN verification failed' };
  }
};

// Export the verifyUserPin function if it's not already exported
exports.verifyUserPin = verifyUserPin;