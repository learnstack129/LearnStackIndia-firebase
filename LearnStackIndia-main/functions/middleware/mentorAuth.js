// functions/middleware/mentorAuth.js

const jwt = require('jsonwebtoken');
const UserService = require('../models/User'); // <-- CHANGED TO UserService

module.exports = async (req, res, next) => {
  try {
    // 1. Get token
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Get user (Mongoose lookup -> UserService)
    const user = await UserService.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found, token invalid' });
    }

    // 4. Check if user is a MENTOR or ADMIN
    if (user.role !== 'mentor' && user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Mentor privileges required' });
    }

    // User is authorized
    req.user = { id: user.id, role: user.role }; // Use user.id (string)
    next();

  } catch (error) {
    console.error('Mentor Auth Error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token is not valid' });
    }
    res.status(500).json({ message: 'Server error during mentor authorization' });
  }
};