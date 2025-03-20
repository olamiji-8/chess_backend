const User = require('../models/User');
const bcrypt = require('bcryptjs');

const verifyUserPin = async (userId, pin) => {
  if (!pin) {
    return { success: false, message: 'PIN is required' };
  }
  
  const user = await User.findById(userId).select('+pin');
  
  if (!user) {
    return { success: false, message: 'User not found' };
  }
  
  const isPinValid = await bcrypt.compare(pin, user.pin);
  
  return {
    success: isPinValid,
    message: isPinValid ? 'PIN verified successfully' : 'Invalid PIN',
    user // Return the user object when verification is successful
  };
};

module.exports = { verifyUserPin };