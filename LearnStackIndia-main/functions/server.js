// functions/server.js - MODIFIED for Firebase Cloud Functions

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// 🚨 REMOVED: const connectDB = require('./config/database');

// Load environment variables (needed to read secrets from Firebase config later)
dotenv.config();

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
// You can apply the limiter here if desired:
// app.use(limiter);

// CORS middleware
app.use(cors({
  origin: true, // This is standard practice for Firebase Functions to allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🚨 REMOVED: DB connection middleware block

// Basic health check
app.get('/api/health', (req, res) => {
  // NOTE: mongoose.connection.readyState check is now inaccurate and removed.
  // We check the environment status instead.
  res.json({
    status: 'Server is running as a Cloud Function!',
    timestamp: new Date().toISOString(),
    node_env: process.env.NODE_ENV || 'development'
  });
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Server is working!',
    timestamp: new Date().toISOString()
  });
});

// --- Route Imports ---
const achievementsModule = require('./routes/achievements');

app.use('/api/auth', require('./routes/auth'));
app.use('/api/topics', require('./routes/topics'));
app.use('/api/achievements', achievementsModule);
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/mentor', require('./routes/mentor'));
app.use('/api/test', require('./routes/test'));
app.use('/api/daily-problem', require('./routes/dailyProblem'));
app.use('/api/doubts', require('./routes/doubts'));
// --- END Route Imports ---

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  console.error('Stack trace:', err.stack);

  let errorMessage = 'Something went wrong!';
  let statusCode = 500;

  if (err.name === 'CastError') {
    errorMessage = `Invalid format for parameter: ${err.path}`;
    statusCode = 400;
  } else if (err.name === 'ValidationError') {
    errorMessage = `Validation Failed: ${Object.values(err.errors).map(e => e.message).join(', ')}`;
    statusCode = 400;
  }

  res.status(statusCode).json({
    message: errorMessage,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    timestamp: new Date().toISOString()
  });
});


// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableBaseRoutes: [
      '/api/health',
      // ... list of your routes
    ]
  });
});

// 🚨 REMOVED: Server startup/listener block (like app.listen)

module.exports = app; // Export app for Cloud Functions