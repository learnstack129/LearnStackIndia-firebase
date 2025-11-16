// models/Leaderboard.js - Global Leaderboard
const mongoose = require('mongoose');
require('./User');
const leaderboardSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'all-time'],
    required: true
  },
  period: {
    start: Date,
    end: Date
  },
  rankings: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    position: {
      type: Number,
      required: true
    },
    score: {
      type: Number,
      required: true
    },
    metrics: {
      algorithmsCompleted: Number,
      averageAccuracy: Number,
      timeSpent: Number,
      streak: Number
    }
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

leaderboardSchema.index({ type: 1, 'period.start': -1 });
leaderboardSchema.index({ 'rankings.position': 1 });


module.exports = mongoose.model('Leaderboard', leaderboardSchema);
