const admin = require('firebase-admin');

// Initialize the Admin SDK only if it hasn't been initialized already
if (admin.apps.length === 0) {
    admin.initializeApp();
}

// Export the Firestore database instance
const db = admin.firestore();

// Utility function to get a reference to a collection
const getCollection = (collectionName) => db.collection(collectionName);

module.exports = { db, getCollection };