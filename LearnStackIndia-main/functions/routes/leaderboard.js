// functions/routes/leaderboard.js - MODIFIED to use LeaderboardService

const express = require('express');
const UserService = require('../models/User'); 
const LeaderboardService = require('../models/Leaderboard'); // <-- CHANGE: Use LeaderboardService
const auth = require('../middleware/auth');

const router = express.Router();

// Helper function to get the ranking period (remains unchanged as it's pure JS date logic)
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

// Helper function to generate leaderboard (MODIFIED to use UserService and LeaderboardService)
async function generateLeaderboard(type) {
  // NOTE: This logic needs to retrieve ALL users, sort them, and select the top 100.
  // For Firestore, fetching and sorting all users is expensive/complex.
  // Temporarily, we retrieve the first 100 users sorted by points (requires a Firestore index).
  
  // We assume UserService.find has been extended to handle sorting/limiting for this purpose
  const users = await UserService.find(
      {}, 
      { 
        field: 'stats.rank.points', 
        direction: 'desc', 
        limit: 100 
      }
  );
  
  const rankings = users.map((user, index) => ({
    user: user.id, // Use Firestore ID (string)
    position: index + 1,
    score: user.stats?.rank?.points ?? 0,
    metrics: {
      algorithmsCompleted: user.stats?.algorithmsCompleted ?? 0,
      averageAccuracy: user.stats?.averageAccuracy ?? 0,
      timeSpent: user.stats?.timeSpent?.total ?? 0,
      streak: user.stats?.streak?.current ?? 0
    }
  }));
  
  // CHANGE: Use LeaderboardService.createOrReplace
  const leaderboard = await LeaderboardService.createOrReplace({
    type,
    period: getPeriod(type),
    rankings
  });
  
  return leaderboard;
}

// Helper function to update user's position (MODIFIED to use UserService and LeaderboardService)
async function updateUserLeaderboardPosition(userId) {
  // CHANGE: Use LeaderboardService.findOne
  let leaderboard = await LeaderboardService.findOne({ type: 'all-time' });
  
  if (!leaderboard) {
    leaderboard = await generateLeaderboard('all-time');
    return;
  }
  
  // CHANGE: Use UserService.findById
  const user = await UserService.findById(userId);
  if (!user) return; // User must exist

  // Find or create user's ranking
  let userRanking = leaderboard.rankings.find(
    r => r.user === userId // Match by string ID
  );
  
  const userMetrics = {
    algorithmsCompleted: user.stats.algorithmsCompleted,
    averageAccuracy: user.stats.averageAccuracy,
    timeSpent: user.stats.timeSpent.total,
    streak: user.stats.streak.current
  };
  
  if (userRanking) {
    userRanking.score = user.stats.rank.points;
    userRanking.metrics = userMetrics;
  } else {
    leaderboard.rankings.push({
      user: userId,
      position: leaderboard.rankings.length + 1,
      score: user.stats.rank.points,
      metrics: userMetrics
    });
  }
  
  // Re-sort and update positions
  leaderboard.rankings.sort((a, b) => b.score - a.score);
  leaderboard.rankings.forEach((rank, index) => {
    rank.position = index + 1;
  });
  
  // CHANGE: Use document's save method via LeaderboardService.updateOne (or direct save)
  await LeaderboardService.updateOne({ type: 'all-time' }, { rankings: leaderboard.rankings });
}

// Get leaderboard
router.get('/', async (req, res) => {
  try {
    const { type = 'all-time', limit = 10 } = req.query;
    
    // CHANGE: Use LeaderboardService.findOne
    let leaderboard = await LeaderboardService.findOne({ type });
    
    if (!leaderboard) {
      leaderboard = await generateLeaderboard(type);
    }
    
    // NOTE: Population must be done manually here
    const userIds = leaderboard.rankings.map(r => r.user);
    const users = (await Promise.all(userIds.map(id => UserService.findById(id)))).filter(u => u);
    const userMap = new Map(users.map(u => [u.id, u]));
    
    const rankings = leaderboard.rankings
      .slice(0, parseInt(limit))
      .map(rank => {
          const user = userMap.get(rank.user);
          if (!user) return null;

          return {
            position: rank.position,
            username: user.username,
            avatar: user.profile.avatar,
            rank: user.stats.rank.level,
            score: rank.score,
            metrics: rank.metrics
          };
      }).filter(Boolean);
    
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
    // CHANGE: Use UserService.findById
    const user = await UserService.findById(req.user.id);
    
    // Find user's position in all-time leaderboard
    const leaderboard = await LeaderboardService.findOne({ type: 'all-time' });
    
    let position = null;
    if (leaderboard) {
      const userRank = leaderboard.rankings.find(
        r => r.user === req.user.id
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

module.exports = router;