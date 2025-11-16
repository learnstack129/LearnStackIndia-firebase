// backend/config/database.js

const mongoose = require('mongoose');

// Get the connection string from environment variables
const connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/dsa-visualizer';

/**
 * Global is used here to maintain a cached connection across serverless function invocations.
 * This prevents connections from being recreated on every API call.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  // 1. If we already have a cached connection, reuse it
  if (cached.conn) {
    console.log(' reusing cached MongoDB connection.');
    return cached.conn;
  }

  // 2. If a connection promise is not already in progress, create one
  if (!cached.promise) {
    console.log('🔄 Creating new MongoDB connection promise...');
    
    // Mongoose 7+ (based on your package.json) simplifies options.
    // useNewUrlParser and useUnifiedTopology are no longer needed.
    const options = {
        bufferCommands: false, // Disable Mongoose's buffering before connection
    };

    cached.promise = mongoose.connect(connectionString, options).then((mongooseInstance) => {
      console.log(`✅ MongoDB Connected: ${mongooseInstance.connection.host}`);
      console.log(`📊 Database: ${mongooseInstance.connection.name}`);
      return mongooseInstance;
    }).catch(error => {
        console.error('❌ MongoDB connection error:', error.message);
        cached.promise = null; // Reset promise on error
        // Throwing the error will be caught by your server.js unhandledRejection handler
        throw error; 
    });
  }
  
  // 3. Wait for the connection promise to resolve
  console.log('⏳ Awaiting MongoDB connection promise...');
  cached.conn = await cached.promise;
  return cached.conn;
};

module.exports = connectDB;
