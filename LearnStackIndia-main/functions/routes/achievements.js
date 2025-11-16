// routes/achievements.js - Achievement routes (Adjusted for consolidated array)
const express = require('express');
const AchievementTemplate = require('../models/Achievement');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all achievement templates (No change needed)
router.get('/', async (req, res) => {
    try {
        const achievements = await AchievementTemplate.find({ isActive: true }).lean(); // Use lean
        res.json({ success: true, achievements });
    } catch (error) {
        console.error('❌ Error fetching achievements:', error);
        res.status(500).json({ message: 'Error fetching achievements' });
    }
});

// --- ADJUSTED: Get user's achievements ---
router.get('/user', auth, async (req, res) => {
    try {
        // Select the single 'achievements' array
        const user = await User.findById(req.user.id).select('achievements').lean(); // Use lean

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const allAchievements = user.achievements || []; // Access the consolidated array (already plain objects from lean)

        res.json({
            success: true,
            achievements: allAchievements,
            total: allAchievements.length
        });
    } catch (error) {
        console.error('❌ Error fetching user achievements:', error);
        res.status(500).json({ message: 'Error fetching user achievements' });
    }
});

// --- ADJUSTED: Check and award achievements ---
router.post('/check', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id); // Get full user document
        if (!user) return res.status(404).json({ message: 'User not found' });

        const templates = await AchievementTemplate.find({ isActive: true }).lean(); // Use lean for templates

        const newlyEarnedAchievements = []; // Track newly awarded achievements

        for (const template of templates) {
            // Check if user already has this achievement using the user method
            if (user.hasAchievement(template.id)) {
                continue;
            }

            // Check criteria (pass the full user object)
            const earned = checkAchievementCriteria(user, template);

            if (earned) {
                // Award the achievement using the user method
                const awarded = user.awardAchievement(template); // awardAchievement handles adding points and marking modified
                if (awarded) { // Check if it was successfully awarded
                    // Find the newly added achievement in the user's array to return it
                    const awardedData = user.achievements.find(a => a.id === template.id);
                     if (awardedData) {
                         newlyEarnedAchievements.push(awardedData.toObject ? awardedData.toObject() : awardedData); // Add plain object to response
                     }
                }
            }
        }

        // Save the user if any achievements were awarded or rank points changed
        if (user.isModified('achievements') || user.isModified('stats.rank')) {
            await user.save();
            console.log(`[Check Achievements] Saved user ${user.username} after potentially awarding achievements.`);
        }

        res.json({
            success: true,
            newAchievements: newlyEarnedAchievements, // Send only the newly earned ones
            totalPoints: user.stats.rank.points // Send updated points
        });
    } catch (error) {
        console.error('❌ Error checking achievements:', error);
        res.status(500).json({ message: 'Error checking/awarding achievements' });
    }
});


// --- ADJUSTED: Helper function to check achievement criteria ---
function checkAchievementCriteria(user, template) {
    const { type, value } = template.criteria;
    const userStats = user.stats || {};
    const userRank = userStats.rank || {};
    const userStreak = userStats.streak || {};
    const userProgress = user.progress; // This is a Map

    try {
        switch (type) {
            case 'complete_topic': // value = topicId
                const topicProg = userProgress.get(value);
                return !!topicProg && topicProg.completion === 100;

            case 'algorithms_completed': // value = count
                return (userStats.algorithmsCompleted || 0) >= value;

            case 'streak': // value = days
                return (userStreak.current || 0) >= value;

            case 'reach_rank': // value = rank level string
                return (userRank.level || 'Bronze') === value;

            case 'total_points': // value = points
                return (userRank.points || 0) >= value;

            case 'first_completion': // value = 1
                return (userStats.algorithmsCompleted || 0) >= value;

            case 'first_login': // value = 1
                return true; // If checking, login happened

             case 'profile_complete': // value = true
                 // Define "complete" - adjust as needed
                 return !!(user.profile.firstName && user.profile.lastName && user.profile.bio);

            case 'perfect_accuracy': // value = 100 (or other threshold)
                for (const topicProgress of userProgress.values()) {
                    for (const algoProgress of topicProgress.algorithms.values()) {
                        // Check practice accuracy specifically
                        if (algoProgress.completed && algoProgress.attemptsPractice > 0 && algoProgress.accuracyPractice === value) {
                            return true;
                        }
                    }
                }
                return false;

            case 'speed_completion': // value = { count: 10, time: 30 }
                 if (typeof value !== 'object' || !value.count || !value.time) return false;
                 let fastCompletions = 0;
                 for (const topicProgress of userProgress.values()) {
                     for (const algoProgress of topicProgress.algorithms.values()) {
                         if (algoProgress.completed && algoProgress.bestTimePractice !== null && algoProgress.bestTimePractice !== undefined && algoProgress.bestTimePractice <= value.time) {
                             fastCompletions++;
                         }
                     }
                 }
                 return fastCompletions >= value.count;

            // --- Add more checks based on seedAchievements.js criteria ---

            case 'time_limit': // value = { seconds: 15 } - Check bestTimePractice of *any* completed algo
                 if (typeof value !== 'object' || !value.seconds) return false;
                 for (const topicProgress of userProgress.values()) {
                     for (const algoProgress of topicProgress.algorithms.values()) {
                         if (algoProgress.completed && algoProgress.bestTimePractice !== null && algoProgress.bestTimePractice !== undefined && algoProgress.bestTimePractice <= value.seconds) {
                             return true;
                         }
                     }
                 }
                 return false;

            // Note: Implementing streak-based accuracy ('high_accuracy_streak', 'perfect_streak')
            // would require storing more historical attempt data than the current model has.
            // These checks are simplified/omitted for now.

            case 'daily_time': // value = { minutes: 30, days: 7 }
                 if (typeof value !== 'object' || !value.minutes || !value.days) return false;
                 if (!user.dailyActivity || user.dailyActivity.length < value.days) return false;
                 const recentDays = user.dailyActivity.slice(-value.days); // Get last 'days' entries
                 if (recentDays.length < value.days) return false; // Ensure enough days recorded
                 return recentDays.every(day => day.timeSpent >= value.minutes);

            case 'monthly_time': // value = 600 (minutes)
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                let monthTotalTime = 0;
                (user.dailyActivity || []).forEach(day => {
                     if (day.date >= startOfMonth) {
                         monthTotalTime += day.timeSpent;
                     }
                });
                return monthTotalTime >= value;

            // 'time_range', 'weekend_completion' would require checking session timestamps or lastAttempt dates.
            // 'comeback' requires comparing lastActiveDate to now.
            // 'perfect_topic' requires iterating through a topic's algos to check 100% accuracy.

            default:
                console.warn(`[Check Criteria] Unknown achievement type: ${type}`);
                return false;
        }
    } catch (err) {
         console.error(`[Check Criteria] Error checking type "${type}" for template "${template.id}":`, err);
         return false;
    }
}

module.exports = router;