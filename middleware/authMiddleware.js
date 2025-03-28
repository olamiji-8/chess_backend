const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('express-async-handler');

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

exports.protect = asyncHandler(async (req, res, next) => {
  let user;

  // ✅ 1️⃣ Check if user is logged in via session
  if (req.session && req.session.userId && req.session.isLoggedIn) {
    user = await User.findById(req.session.userId);
  } 
  // ✅ 2️⃣ Check if user is authenticated via JWT token
  else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      const token = req.headers.authorization.split(" ")[1]; // Extract JWT
      const decoded = jwt.verify(token, SECRET_KEY); // Verify JWT
      user = await User.findById(decoded.userId);
    } catch (error) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  }

  // ❌ If user is not found, return an error
  if (!user) {
    return res.status(401).json({ message: "Not authorized, no valid session or token" });
  }

  req.user = user;
  next();
});

// ✅ Admin Middleware
exports.adminOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as admin' });
  }
});

exports.admin = exports.adminOnly;
