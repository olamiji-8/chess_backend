const admin = (req, res, next) => {
    // User should be loaded from auth middleware
    if (!req.user) {
      return res.status(401).json({ msg: 'No authentication token, authorization denied' });
    }
  
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized as an admin' });
    }
  
    next();
  };
  
  module.exports = admin;