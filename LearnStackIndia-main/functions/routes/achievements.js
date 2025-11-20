// functions/routes/achievements.js - MODIFIED to use AchievementService

const express = require('express');
const AchievementService = require('../models/Achievement'); // <-- CHANGE: Use AchievementService
const UserService = require('../models/User'); // <-- CHANGE: Use UserService
// 🚨 TEMPORARY: Keeping Mongoose import until all logic is converted.
const mongoose = require('mongoose'); 
const auth = require('../middleware/auth');


const router = express.Router();

// Get all achievement templates
router.get('/', async (req, res) => {
    try {
        // CHANGE: Use AchievementService.find
        const achievements = await AchievementService.find({ isActive: true }); 
        res.json({ success: true, achievements });
    } catch (error) {
        console.error('❌ Error fetching achievements:', error);
        res.status(500).json({ message: 'Error fetching achievements' });
    }
});

// Get user's achievements
router.get('/user', auth, async (req, res) => {
    try {
        // CHANGE: Use UserService.findById
        const user = await UserService.findById(req.user.id); 

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const allAchievements = user.achievements || [];

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

// Check and award achievements
router.post('/check', auth, async (req, res) => {
    try {
        // CHANGE: Use UserService.findById
        let user = await UserService.findById(req.user.id); 
        if (!user) return res.status(404).json({ message: 'User not found' });

        // CHANGE: Use AchievementService.find
        const templates = await AchievementService.find({ isActive: true }); 

        const newlyEarnedAchievements = []; 

        for (const template of templates) {
            // Check if user already has this achievement using the user method
            if (user.hasAchievement(template.id)) {
                continue;
            }

            // NOTE: checkAchievementCriteria relies on Mongoose/Map structure, OK for now.
            const earned = checkAchievementCriteria(user, template);

            if (earned) {
                // Award the achievement using the user method
                // NOTE: This will require a separate save operation or reliance on the UserService.update method after the loop.
                const awarded = user.awardAchievement(template); 
                if (awarded) { 
                    const awardedData = user.achievements.find(a => a.id === template.id);
                     if (awardedData) {
                         newlyEarnedAchievements.push(awardedData);
                     }
                }
            }
        }

        // Save the user if any achievements were awarded or rank points changed
        // NOTE: This relies on the Mongoose save logic being available/mimicked in the UserService update.
        await UserService.update(user.id, user);

        // Refetch user to get final stats
        user = await UserService.findById(user.id);


        res.json({
            success: true,
            newAchievements: newlyEarnedAchievements, 
            totalPoints: user.stats.rank.points 
        });
    } catch (error) {
        console.error('❌ Error checking achievements:', error);
        res.status(500).json({ message: 'Error checking/awarding achievements' });
    }
});


// --- Helper function to check achievement criteria (Relies on Mongoose/Map structure) ---
function checkAchievementCriteria(user, template) {
    // ... (Logic remains the same, relies on user properties being available)
    const { type, value } = template.criteria;
    const userStats = user.stats || {};
    const userRank = userStats.rank || {};
    const userStreak = userStats.streak || {};
    const userProgress = user.progress; // This is a Map (from UserService mapping)

    try {
        switch (type) {
            case 'complete_topic': 
                const topicProg = userProgress.get(value);
                return !!topicProg && topicProg.completion === 100;

            case 'algorithms_completed': 
                return (userStats.algorithmsCompleted || 0) >= value;

            case 'streak': 
                return (userStreak.current || 0) >= value;

            case 'reach_rank': 
                return (userRank.level || 'Bronze') === value;

            case 'total_points': 
                return (userRank.points || 0) >= value;

            case 'first_completion': 
                return (userStats.algorithmsCompleted || 0) >= value;

            case 'first_login': 
                return true; 

             case 'profile_complete': 
                 return !!(user.profile.firstName && user.profile.lastName && user.profile.bio);

            case 'perfect_accuracy': 
                for (const topicProgress of userProgress.values()) {
                    for (const algoProgress of topicProgress.algorithms.values()) {
                        if (algoProgress.completed && algoProgress.attemptsPractice > 0 && algoProgress.accuracyPractice === value) {
                            return true;
                        }
                    }
                }
                return false;

            case 'time_limit': 
                 if (typeof value !== 'object' || !value.seconds) return false;
                 for (const topicProgress of userProgress.values()) {
                     for (const algoProgress of topicProgress.algorithms.values()) {
                         if (algoProgress.completed && algoProgress.bestTimePractice !== null && algoProgress.bestTimePractice !== undefined && algoProgress.bestTimePractice <= value.seconds) {
                             return true;
                         }
                     }
                 }
                 return false;

            case 'daily_time': 
                 if (typeof value !== 'object' || !value.minutes || !value.days) return false;
                 if (!user.dailyActivity || user.dailyActivity.length < value.days) return false;
                 const recentDays = user.dailyActivity.slice(-value.days);
                 if (recentDays.length < value.days) return false; 
                 return recentDays.every(day => day.timeSpent >= value.minutes);

            case 'monthly_time': 
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                let monthTotalTime = 0;
                (user.dailyActivity || []).forEach(day => {
                     if (day.date instanceof Date && day.date >= startOfMonth) {
                         monthTotalTime += day.timeSpent;
                     }
                });
                return monthTotalTime >= value;

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