// middleware/adminAuth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    // 1. Get token and check if it exists
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Get user and check role
    const user = await User.findById(decoded.id).select('+role'); // Select role explicitly if needed
    if (!user) {
      return res.status(401).json({ message: 'User not found, token invalid' });
    }

    // 4. Check if user is an admin
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admin privileges required' });
    }

    // User is authenticated and is an admin
    req.user = { id: user._id, role: user.role }; // Attach user info to request
    next(); // Proceed to the next middleware or route handler

  } catch (error) {
    console.error('Admin Auth Error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token is not valid' });
    }
    res.status(500).json({ message: 'Server error during admin authorization' });
  }
};