// functions/middleware/auth.js

const jwt = require('jsonwebtoken');
const UserService = require('../models/User'); // <-- CHANGED TO UserService

module.exports = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from token (Mongoose lookup -> UserService)
    const user = await UserService.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    req.user = { id: user.id }; // Use user.id (string) instead of user._id (ObjectId)
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};