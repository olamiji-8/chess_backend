const Contact = require('../models/Contact');
const asyncHandler = require('express-async-handler');

// @desc    Send contact message
// @route   POST /api/contact
// @access  Public
exports.sendContactMessage = asyncHandler(async (req, res) => {
  const { name, email, phoneNumber, whatsappNumber, message } = req.body;
  
  if (!name || !email || !message) {
    return res.status(400).json({ message: 'Please provide name, email and message' });
  }
  
  await Contact.create({
    name,
    email,
    phoneNumber,
    whatsappNumber,
    message
  });
  
  res.status(201).json({
    success: true,
    message: 'Message sent successfully'
  });
});