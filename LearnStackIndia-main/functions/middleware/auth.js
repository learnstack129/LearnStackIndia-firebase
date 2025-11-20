// functions/middleware/auth.js

const admin = require('firebase-admin'); // 👈 NEW: Import Firebase Admin SDK
const UserService = require('../models/User'); // Assume UserService handles Firestore/MongoDB lookup

module.exports = async (req, res, next) => {
  try {
    // 1. Get the Firebase ID token from the Authorization header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No authentication token provided. Authorization denied.' });
    }

    // 2. Verify the token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid; // This is the unique Firebase User ID

    // 3. Look up the user document in our database using the UID
    const user = await UserService.findById(uid);
    
    if (!user) {
      // User is authenticated by Firebase Auth, but the profile document is missing in the database.
      // 404/403 ensures the frontend's makeAuthenticatedAPICall redirects the user.
      return res.status(404).json({ 
          message: 'User profile not found in database. Please ensure you have completed registration.' 
      });
    }

    // 4. Attach the user's ID to the request object
    req.user = { id: user.id }; 
    next();
  } catch (error) {
    console.error('Firebase Token Verification Error:', error);
    // If Firebase Admin SDK rejects the token (expired, invalid format, etc.)
    res.status(401).json({ message: 'Invalid or expired authentication token.' });
  }
};
