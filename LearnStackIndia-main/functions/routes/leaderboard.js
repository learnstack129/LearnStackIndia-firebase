// routes/leaderboard.js - Leaderboard routes
const express = require('express');
const User = require('../models/User'); // <-- MOVED UP
const Leaderboard = require('../models/Leaderboard');
const auth = require('../middleware/auth');

const router = express.Router();

// Get leaderboard
router.get('/', async (req, res) => {
  try {
    const { type = 'all-time', limit = 10 } = req.query;
    
    let leaderboard = await Leaderboard.findOne({ type })
      .populate('rankings.user', 'username profile.avatar stats.rank')
      .sort({ 'period.start': -1 });
    
    if (!leaderboard) {
      // Generate leaderboard if doesn't exist
      leaderboard = await generateLeaderboard(type);
    }
    
    const rankings = leaderboard.rankings
      .slice(0, parseInt(limit))
      .map(rank => ({
        position: rank.position,
        username: rank.user.username,
        avatar: rank.user.profile.avatar,
        rank: rank.user.stats.rank.level,
        score: rank.score,
        metrics: rank.metrics
      }));
    
    res.json({
      success: true,
      type,
      rankings,
      lastUpdated: leaderboard.lastUpdated
    });
  } catch (error) {
    console.error('❌ Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Error fetching leaderboard' });
  }
});

// Update user's leaderboard position
router.post('/update', auth, async (req, res) => {
  try {
    await updateUserLeaderboardPosition(req.user.id);
    
    res.json({
      success: true,
      message: 'Leaderboard updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating leaderboard:', error);
    res.status(500).json({ message: 'Error updating leaderboard' });
  }
});

// Get user's rank
router.get('/my-rank', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    // Find user's position in all-time leaderboard
    const leaderboard = await Leaderboard.findOne({ type: 'all-time' });
    
    let position = null;
    if (leaderboard) {
      const userRank = leaderboard.rankings.find(
        r => r.user.toString() === req.user.id
      );
      position = userRank ? userRank.position : null;
    }
    
    res.json({
      success: true,
      rank: {
        level: user.stats.rank.level,
        points: user.stats.rank.points,
        position: position || 'Unranked'
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user rank:', error);
    res.status(500).json({ message: 'Error fetching user rank' });
  }
});

// Helper function to generate leaderboard
async function generateLeaderboard(type) {
  const users = await User.find({})
    .select('username profile stats')
    .sort({ 'stats.rank.points': -1 })
    .limit(100);
  
  const rankings = users.map((user, index) => ({
    user: user._id,
    position: index + 1,
    score: user.stats.rank.points,
    metrics: {
      algorithmsCompleted: user.stats.algorithmsCompleted,
      averageAccuracy: user.stats.averageAccuracy,
      timeSpent: user.stats.timeSpent.total,
      streak: user.stats.streak.current
    }
  }));
  
  const leaderboard = new Leaderboard({
    type,
    period: getPeriod(type),
    rankings,
    lastUpdated: new Date()
  });
  
  await leaderboard.save();
  return leaderboard;
}

// Helper function to update user's position
async function updateUserLeaderboardPosition(userId) {
  const leaderboard = await Leaderboard.findOne({ type: 'all-time' });
  
  if (!leaderboard) {
    await generateLeaderboard('all-time');
    return;
  }
  
  const user = await User.findById(userId);
  
  // Find or create user's ranking
  let userRanking = leaderboard.rankings.find(
    r => r.user.toString() === userId
  );
  
  if (userRanking) {
    userRanking.score = user.stats.rank.points;
    userRanking.metrics = {
      algorithmsCompleted: user.stats.algorithmsCompleted,
      averageAccuracy: user.stats.averageAccuracy,
      timeSpent: user.stats.timeSpent.total,
      streak: user.stats.streak.current
    };
  } else {
    leaderboard.rankings.push({
      user: userId,
      position: leaderboard.rankings.length + 1,
      score: user.stats.rank.points,
      metrics: {
        algorithmsCompleted: user.stats.algorithmsCompleted,
        averageAccuracy: user.stats.averageAccuracy,
        timeSpent: user.stats.timeSpent.total,
        streak: user.stats.streak.current
      }
    });
  }
  
  // Re-sort and update positions
  leaderboard.rankings.sort((a, b) => b.score - a.score);
  leaderboard.rankings.forEach((rank, index) => {
    rank.position = index + 1;
  });
  
  leaderboard.lastUpdated = new Date();
  await leaderboard.save();
}

// Helper function to get period
function getPeriod(type) {
  const now = new Date();
  const start = new Date(now);
  
  switch (type) {
    case 'daily':
      start.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      break;
    case 'monthly':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'all-time':
      return { start: new Date(0), end: null };
  }
  
  return { start, end: now };
}


module.exports = router;
