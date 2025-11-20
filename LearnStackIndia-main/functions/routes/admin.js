// functions/routes/admin.js - MODIFIED to use LeaderboardService

const express = require('express');
const mongoose = require('mongoose'); // Mongoose import needed for legacy objects/methods temporarily
const adminAuth = require('../middleware/adminAuth'); 
const UserService = require('../models/User'); 
const TopicService = require('../models/Topic'); 
const AchievementService = require('../models/Achievement'); 
const LeaderboardService = require('../models/Leaderboard'); // <-- CHANGED TO LeaderboardService
const SubjectMetaService = require('../models/SubjectMeta');


const router = express.Router();

// --- Stats ---
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const [totalUsers, activeTopics, totalAchievements, leaderboardEntries] = await Promise.all([
            // CHANGE: User/Topic/Achievement are now Service finds
            UserService.find().then(users => users.length), 
            TopicService.find({ isActive: true }).then(topics => topics.length), 
            AchievementService.find({ isActive: true }).then(ach => ach.length), 
            // CHANGE: Use LeaderboardService.findOne
            LeaderboardService.findOne({ type: 'all-time' })
        ]);

        res.json({
            success: true,
            stats: {
                totalUsers,
                activeTopics,
                totalAchievements,
                leaderboardUsers: leaderboardEntries?.rankings?.length || 0
            }
        });
    } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).json({ message: 'Error fetching admin stats' });
    }
});

// --- User Management ---
router.get('/users', adminAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const searchTerm = req.query.search || '';
        let sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

        // NOTE: Temporarily simplified: Fetch all and paginate/sort in memory (UNSAFE for real Firestore deployment)
        const users = await UserService.find(); 
        const totalUsers = users.length;
        const totalPages = Math.ceil(totalUsers / limit);
        const usersPage = users.slice(skip, skip + limit);

        res.json({
            success: true, users: usersPage,
            totalPages: totalPages, currentPage: page, totalUsers
        });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: 'Error fetching users' });
    }
});

router.get('/users/:id', adminAuth, async (req, res) => {
    try {
        const user = await UserService.findById(req.params.id); 
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ success: true, user });
    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ message: 'Error fetching user' });
    }
});

// --- Get topic statuses for a specific user, grouped by subject ---
router.get('/users/:userId/topic-statuses', adminAuth, async (req, res) => {
    try {
        const userId = req.params.userId;
        const [user, topics] = await Promise.all([
            UserService.findById(userId),
            TopicService.find({}, { field: 'order', direction: 'asc' })
        ]);

        if (!user) return res.status(404).json({ message: 'User not found' });

        const userProgressMap = user.progress;
        const completedTopicsSet = new Set(user.learningPath?.completedTopics || []);
        const subjectGroupedStatuses = {};

        topics.forEach(topic => {
            const userProgressForTopic = userProgressMap.get(topic.id);

            let prereqsMet = true;
            if (topic.prerequisites && topic.prerequisites.length > 0) {
                prereqsMet = topic.prerequisites.every(prereqId => completedTopicsSet.has(prereqId));
            }

            let userSpecificStatus;
            if (userProgressForTopic?.status) {
                userSpecificStatus = userProgressForTopic.status;
            } else {
                userSpecificStatus = topic.isGloballyLocked ? 'locked' : 'available';
            }

            let finalEffectiveStatus;
            if (topic.isGloballyLocked) {
                finalEffectiveStatus = (userSpecificStatus !== 'locked') ? userSpecificStatus : 'locked';
            } else if (!prereqsMet) {
                 finalEffectiveStatus = (userSpecificStatus !== 'locked') ? userSpecificStatus : 'locked';
            } else {
                finalEffectiveStatus = userSpecificStatus;
            }

            let statusText = finalEffectiveStatus.charAt(0).toUpperCase() + finalEffectiveStatus.slice(1);
             if (finalEffectiveStatus === 'locked') {
                if (topic.isGloballyLocked && userSpecificStatus !== 'locked') statusText = `Globally Locked (User Override: ${userSpecificStatus})`;
                else if (topic.isGloballyLocked) statusText = 'Locked Globally';
                else if (!prereqsMet && userSpecificStatus === 'locked') statusText = 'Locked (Prerequisites)';
                else if (userSpecificStatus === 'locked') statusText = 'Locked for User';
                else statusText = 'Locked (Prerequisites)';
            } else if (topic.isGloballyLocked) {
                statusText = `Unlocked for User (${statusText})`;
            }
            
            const algorithmsWithUserProgress = (topic.algorithms || []).map(algoDef => {
                const userProgress = userProgressForTopic?.algorithms?.get(algoDef.id);
                const algoUserSpecificStatus = userProgress?.status || 'available';
                const algoIsGloballyLocked = algoDef.isGloballyLocked === true;
                let effectiveAlgoStatus = 'available';

                if (algoIsGloballyLocked) {
                     effectiveAlgoStatus = (algoUserSpecificStatus === 'available') ? 'available' : 'locked';
                } else {
                     effectiveAlgoStatus = algoUserSpecificStatus;
                }
                
                if (finalEffectiveStatus === 'locked') { 
                    effectiveAlgoStatus = 'locked';
                }

                return {
                    ...algoDef, 
                    userProgress: userProgress || { status: 'available', completed: false }, 
                    effectiveAlgoStatus: effectiveAlgoStatus 
                };
            });

            const topicStatusData = {
                _id: topic._id,
                id: topic.id,
                name: topic.name,
                effectiveStatus: finalEffectiveStatus,
                statusText: statusText,
                isGloballyLocked: topic.isGloballyLocked,
                isUserLocked: userSpecificStatus === 'locked',
                algorithms: algorithmsWithUserProgress 
            };
            
            const subjectName = topic.subject || 'General';
            if (!subjectGroupedStatuses[subjectName]) {
                subjectGroupedStatuses[subjectName] = [];
            }
            subjectGroupedStatuses[subjectName].push(topicStatusData);
        });

        res.json({
            success: true,
            username: user.username,
            subjectGroupedStatuses: subjectGroupedStatuses
        });

    } catch (error) {
        console.error(`Error fetching topic statuses for user ${req.params.userId}:`, error);
        res.status(500).json({ message: 'Error fetching topic statuses', error: error.message }); 
    }
});


router.put('/users/:id', adminAuth, async (req, res) => {
    try {
        const { role, isEmailVerified } = req.body;
        
        let user = await UserService.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        if (role && ['user', 'mentor', 'admin'].includes(role)) user.role = role;
        if (typeof isEmailVerified === 'boolean') {
            user.isEmailVerified = isEmailVerified;
            if (isEmailVerified) {
                user.emailVerificationToken = null;
                user.emailVerificationExpires = null;
            }
        }
        
        const updatedUser = await UserService.update(user.id, user);

        res.json({ success: true, message: 'User updated successfully', user: updatedUser });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: 'Error updating user' });
    }
});

router.delete('/users/:id', adminAuth, async (req, res) => {
    try {
        const deletedUser = await UserService.delete(req.params.id);
        
        if (!deletedUser) return res.status(404).json({ message: 'User not found' });
        
        // NOTE: Cleanup in Leaderboard must still be handled (currently Mongoose syntax)
        
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ message: 'Error deleting user' });
    }
});

// --- Subject Management ---

router.get('/subjects', adminAuth, async (req, res) => {
    try {
        const subjects = await TopicService.distinct('subject');
        res.json({ success: true, subjects: subjects.sort() });
    } catch (error) {
        console.error("Error fetching subjects:", error);
        res.status(500).json({ message: 'Error fetching subjects' });
    }
});

router.get('/subject-meta', adminAuth, async (req, res) => {
    try {
        const meta = await SubjectMetaService.find();
        res.json({ success: true, meta });
    } catch (error) {
        console.error("Error fetching subject meta:", error);
        res.status(500).json({ message: 'Error fetching subject metadata' });
    }
});

router.post('/subject-meta', adminAuth, async (req, res) => {
    try {
        const { name, icon, color } = req.body;
        if (!name || !icon || !color) {
            return res.status(400).json({ message: 'Name, icon, and color are required.' });
        }

        const updatedMeta = await SubjectMetaService.findOneAndUpdate(
            { name: name }, 
            { icon, color }, 
            { upsert: true, new: true, runValidators: true } 
        );

        res.json({ success: true, message: 'Subject metadata updated', meta: updatedMeta });
    } catch (error) {
        console.error("Error updating subject meta:", error);
        res.status(500).json({ message: 'Error updating subject metadata' });
    }
});

router.post('/subjects/:subjectName/lock', adminAuth, async (req, res) => {
    try {
        const { userId, global } = req.body;
        const subjectName = req.params.subjectName;

        const topicsToLock = await TopicService.find({ subject: subjectName });
        if (!topicsToLock || topicsToLock.length === 0) {
            return res.status(404).json({ message: `No topics found for subject '${subjectName}'` });
        }
        const topicCustomIds = topicsToLock.map(t => t.id);

        if (global) {
            const topicMongoIds = topicsToLock.map(t => t._id); 
            await TopicService.updateMany(
                { _id: { $in: topicMongoIds } },
                { $set: { isGloballyLocked: true } }
            );
            return res.json({ success: true, message: `Subject "${subjectName}" (${topicsToLock.length} topics) locked globally.` });

        } else if (userId) {
            const user = await UserService.findById(userId);
            if (!user) return res.status(404).json({ message: 'User not found' });

            let modified = false;
            for (const topicCustomId of topicCustomIds) {
                let topicProgress = user.progress.get(topicCustomId);
                if (!topicProgress) {
                    topicProgress = { status: 'locked', completion: 0, totalTime: 0, algorithms: new Map() };
                } else if (topicProgress.status !== 'locked') {
                    topicProgress.status = 'locked'; 
                }
                user.progress.set(topicCustomId, topicProgress); 
                modified = true;
            }
            
            if (modified) {
                await UserService.update(user.id, user); 
            }
            return res.json({ success: true, message: `Subject "${subjectName}" (${topicsToLock.length} topics) locked for user "${user.username}".` });
        } else {
            return res.status(400).json({ message: 'Request must specify "userId" or "global: true".' });
        }
    } catch (error) {
        console.error("Error locking subject:", error);
        res.status(500).json({ message: 'Error locking subject' });
    }
});

router.post('/subjects/:subjectName/unlock', adminAuth, async (req, res) => {
     try {
        const { userId, global } = req.body;
        const subjectName = req.params.subjectName;

        const topicsToUnlock = await TopicService.find({ subject: subjectName });
        if (!topicsToUnlock || topicsToUnlock.length === 0) {
            return res.status(404).json({ message: `No topics found for subject '${subjectName}'` });
        }
        
        if (global) {
            const topicMongoIds = topicsToUnlock.map(t => t._id);
            await TopicService.updateMany(
                { _id: { $in: topicMongoIds } },
                { $set: { isGloballyLocked: false } }
            );
            return res.json({ success: true, message: `Subject "${subjectName}" (${topicsToUnlock.length} topics) unlocked globally.` });

        } else if (userId) {
            const user = await UserService.findById(userId);
            if (!user) return res.status(404).json({ message: 'User not found' });
            
            let modified = false;

            for (const topic of topicsToUnlock) {
                const topicCustomId = topic.id;
                const userProgressForTopic = user.progress.get(topicCustomId);

                if (userProgressForTopic && userProgressForTopic.status === 'locked') {
                     userProgressForTopic.status = 'available';
                     user.progress.set(topicCustomId, userProgressForTopic);
                     modified = true;
                } else if (!userProgressForTopic) {
                     user.progress.set(topicCustomId, { status: 'available', completion: 0, totalTime: 0, algorithms: new Map() });
                     modified = true;
                }
            }

            if (modified) {
                await UserService.update(user.id, user);
            }
            return res.json({ success: true, message: `Subject "${subjectName}" (${topicsToUnlock.length} topics) unlocked for user "${user.username}".` });
        } else {
            return res.status(400).json({ message: 'Request must specify "userId" or "global: true".' });
        }
    } catch (error) {
        console.error("Error unlocking subject:", error);
        res.status(500).json({ message: 'Error unlocking subject' });
    }
});


// --- Topic Management ---
router.get('/topics', adminAuth, async (req, res) => { 
    try { 
        const topics = await TopicService.find({}, { field: 'order', direction: 'asc' });
        res.json({ success: true, topics }); 
    } catch (error) { 
        console.error("Error fetching topics for admin:", error); 
        res.status(500).json({ message: 'Error fetching topics' }); 
    } 
});

router.get('/topics/:id', adminAuth, async (req, res) => { 
    try { 
        const topic = await TopicService.findById(req.params.id); 
        if (!topic) return res.status(404).json({ message: 'Topic not found' }); 
        res.json({ success: true, topic }); 
    } catch (error) { 
        console.error("Error fetching single topic:", error); 
        res.status(500).json({ message: 'Error fetching topic' }); 
    } 
});

router.post('/topics', adminAuth, async (req, res) => { 
    try { 
        const newTopic = await TopicService.create(req.body);
        res.status(201).json({ success: true, message: 'Topic created', topic: newTopic }); 
    } catch (error) { 
        console.error("Error creating topic:", error); 
        if (error.code === 11000) return res.status(400).json({ message: `Topic ID '${req.body.id}' already exists.` }); 
        if (error.name === 'ValidationError') return res.status(400).json({ message: `Validation Error: ${error.message}` }); 
        res.status(500).json({ message: 'Error creating topic' }); 
    } 
});

router.put('/topics/:id', adminAuth, async (req, res) => { 
    try { 
        const updatedTopic = await TopicService.findByIdAndUpdate(req.params.id, req.body); 
        if (!updatedTopic) return res.status(404).json({ message: 'Topic not found' }); 
        res.json({ success: true, message: 'Topic updated', topic: updatedTopic }); 
    } catch (error) { 
        console.error("Error updating topic:", error); 
        res.status(500).json({ message: 'Error updating topic' }); 
    } 
});

router.delete('/topics/:id', adminAuth, async (req, res) => { 
    try { 
        const deletedTopic = await TopicService.findByIdAndDelete(req.params.id); 
        if (!deletedTopic) return res.status(404).json({ message: 'Topic not found' }); 
        res.json({ success: true, message: 'Topic deleted' }); 
    } catch (error) { 
        console.error("Error deleting topic:", error); 
        res.status(500).json({ message: 'Error deleting topic' }); 
    } 
});


// --- Achievement Management ---
router.get('/achievements', adminAuth, async (req, res) => { 
    try { 
        const achievements = await AchievementService.find(); 
        res.json({ success: true, achievements }); 
    } catch (error) { 
        console.error("Error fetching achievements for admin:", error); 
        res.status(500).json({ message: 'Error fetching achievements' }); 
    } 
});

router.get('/achievements/:id', adminAuth, async (req, res) => { 
    try { 
        const achievement = await AchievementService.findById(req.params.id); 
        if (!achievement) return res.status(404).json({ message: 'Achievement not found' }); 
        achievement.criteriaJson = JSON.stringify(achievement.criteria || {}, null, 2); 
        res.json({ success: true, achievement }); 
    } catch (error) { 
        console.error("Error fetching single achievement:", error); 
        res.status(500).json({ message: 'Error fetching achievement' }); 
    } 
});

router.post('/achievements', adminAuth, async (req, res) => { 
    try { 
        const { id, name, description, icon, category, points, criteriaJson, isActive, rarity } = req.body; 
        if (!id || !name || !description || !icon || !category || points === undefined || !criteriaJson) return res.status(400).json({ message: 'Missing required fields' }); 
        
        let criteria; 
        try { 
            criteria = JSON.parse(criteriaJson); 
            if (typeof criteria !== 'object' || criteria === null || typeof criteria.type !== 'string' || criteria.value === undefined) throw new Error("Criteria JSON must be object with 'type' and 'value'."); 
        } catch (e) { 
            return res.status(400).json({ message: `Invalid Criteria JSON: ${e.message}` }); 
        } 
        
        const newAchievement = await AchievementService.create({ 
            id, name, description, icon, category, points, criteria, isActive: isActive !== undefined ? isActive : true, rarity: rarity || 'common' 
        });
        
        res.status(201).json({ success: true, message: 'Achievement created', achievement: newAchievement }); 
    } catch (error) { 
        console.error("Error creating achievement:", error); 
        if (error.code === 11000) return res.status(400).json({ message: `Achievement ID '${req.body.id}' already exists.` }); 
        if (error.name === 'ValidationError') return res.status(400).json({ message: `Validation Error: ${error.message}` }); 
        res.status(500).json({ message: 'Error creating achievement' }); 
    } 
});

router.put('/achievements/:id', adminAuth, async (req, res) => { 
    try { 
        const { name, description, icon, category, points, criteriaJson, isActive, rarity } = req.body; 
        const updateData = { name, description, icon, category, points, isActive, rarity }; 
        
        if (criteriaJson !== undefined) { 
            let criteria; 
            try { 
                criteria = JSON.parse(criteriaJson); 
                if (typeof criteria !== 'object' || criteria === null || typeof criteria.type !== 'string' || criteria.value === undefined) throw new Error("Criteria JSON must be object with 'type' and 'value'."); 
                updateData.criteria = criteria; 
            } catch (e) { 
                return res.status(400).json({ message: `Invalid Criteria JSON: ${e.message}` }); 
            } 
        } 
        
        const updatedAchievement = await AchievementService.findByIdAndUpdate(req.params.id, updateData); 
        if (!updatedAchievement) return res.status(404).json({ message: 'Achievement not found' }); 
        res.json({ success: true, message: 'Achievement updated', achievement: updatedAchievement }); 
    } catch (error) { 
        console.error("Error updating achievement:", error); 
        res.status(500).json({ message: 'Error updating achievement' }); 
    } 
});

router.delete('/achievements/:id', adminAuth, async (req, res) => { 
    try { 
        const deletedAchievement = await AchievementService.findByIdAndDelete(req.params.id); 
        if (!deletedAchievement) return res.status(404).json({ message: 'Achievement not found' }); 
        
        // NOTE: Cleanup in User model still uses Mongoose for now
        // await UserService.updateMany({}, { $pull: { achievements: { id: deletedAchievement.id } } }); 
        
        res.json({ success: true, message: 'Achievement deleted' }); 
    } catch (error) { 
        console.error("Error deleting achievement:", error); 
        res.status(500).json({ message: 'Error deleting achievement' }); 
    } 
});


// --- Leaderboard Management ---
async function generateLeaderboardUtility(type) {
    console.log(`Generating leaderboard of type: ${type}`);
    
    const users = await UserService.find(
        {}, 
        { 
          field: 'stats.rank.points', 
          direction: 'desc', 
          limit: 100 
        }
    );
    
    const rankings = users.map((user, index) => ({
        user: user.id, 
        position: index + 1,
        score: user.stats?.rank?.points ?? 0, 
        metrics: { 
            algorithmsCompleted: user.stats?.algorithmsCompleted ?? 0,
            averageAccuracy: user.stats?.averageAccuracy ?? 0,
            timeSpent: user.stats?.timeSpent?.total ?? 0,
            streak: user.stats?.streak?.current ?? 0
        }
    }));

    let period = { start: new Date(0), end: null };
    await LeaderboardService.createOrReplace({ type, period, rankings });
    
    console.log(`Generated/Updated ${type} leaderboard with ${rankings.length} entries.`);
}

router.post('/leaderboard/regenerate', adminAuth, async (req, res) => {
    try {
        const { type = 'all-time' } = req.body;
        console.log(`Admin requested regeneration of ${type} leaderboard...`);
        await generateLeaderboardUtility(type);
        res.json({ success: true, message: `Leaderboard type '${type}' regenerated/updated.` });
    } catch (error) {
        console.error("Error regenerating leaderboard:", error);
        res.status(500).json({ message: 'Error regenerating leaderboard' });
    }
});


// --- Lock Topic/Algorithm Routes ---

router.post('/topics/:topicMongoId/lock', adminAuth, async (req, res) => {
    try {
        const { userId, global } = req.body;
        const topicMongoId = req.params.topicMongoId;

        const topicToLock = await TopicService.findById(topicMongoId);
        if (!topicToLock) return res.status(404).json({ message: 'Topic not found' });
        const topicCustomId = topicToLock.id;

        if (global) {
            await TopicService.findByIdAndUpdate(topicMongoId, { isGloballyLocked: true });
            return res.json({ success: true, message: `Topic "${topicToLock.name}" locked globally.` });

        } else if (userId) {
            const user = await UserService.findById(userId);
            if (!user) return res.status(404).json({ message: 'User not found' });

            let topicProgress = user.progress.get(topicCustomId);
            if (!topicProgress) { topicProgress = { status: 'locked', completion: 0, totalTime: 0, algorithms: new Map() }; } 
            else { topicProgress.status = 'locked'; }
            user.progress.set(topicCustomId, topicProgress); 
            
            await UserService.update(user.id, user); 
            return res.json({ success: true, message: `Topic "${topicToLock.name}" locked for user "${user.username}".` });
        } else {
            return res.status(400).json({ message: 'Request must specify "userId" or "global: true".' });
        }
    } catch (error) {
        console.error("Error locking topic:", error);
        res.status(500).json({ message: 'Error locking topic' });
    }
});

router.post('/topics/:topicMongoId/unlock', adminAuth, async (req, res) => {
    try {
        const { userId, global } = req.body;
        const topicMongoId = req.params.topicMongoId;

        const topicToUnlock = await TopicService.findById(topicMongoId);
        if (!topicToUnlock) return res.status(404).json({ message: 'Topic not found' });

        if (global) {
            await TopicService.findByIdAndUpdate(topicMongoId, { isGloballyLocked: false });
            return res.json({ success: true, message: `Topic "${topicToUnlock.name}" unlocked globally.` });

        } else if (userId) {
            const user = await UserService.findById(userId);
            if (!user) return res.status(404).json({ message: 'User not found' });
            
            let modified = false;
            const topicCustomId = topicToUnlock.id;
            const userProgressForTopic = user.progress.get(topicCustomId);

            if (userProgressForTopic && userProgressForTopic.status === 'locked') {
                 userProgressForTopic.status = 'available';
                 user.progress.set(topicCustomId, userProgressForTopic);
                 modified = true;
            } else if (!userProgressForTopic) {
                 user.progress.set(topicCustomId, { status: 'available', completion: 0, totalTime: 0, algorithms: new Map() });
                 modified = true;
            }

            if (modified) {
                await UserService.update(user.id, user);
            }
            return res.json({ success: true, message: `Topic "${topicToUnlock.name}" unlocked for user "${user.username}".` });
        } else {
            return res.status(400).json({ message: 'Request must specify "userId" or "global: true".' });
        }
    } catch (error) {
        console.error("Error unlocking topic:", error);
        res.status(500).json({ message: 'Error unlocking topic' });
    }
});

router.post('/topics/:topicMongoId/algorithms/:algoId/lock', adminAuth, async (req, res) => {
    try {
        const { userId, global } = req.body;
        const { topicMongoId, algoId } = req.params;

        const topic = await TopicService.findById(topicMongoId);
        if (!topic) return res.status(404).json({ message: 'Topic not found' });

        const algorithmIndex = topic.algorithms.findIndex(a => a.id === algoId);
        if (algorithmIndex === -1) return res.status(404).json({ message: `Algorithm '${algoId}' not found in topic '${topic.name}'` });
        const algorithm = topic.algorithms[algorithmIndex];

        if (global) {
            topic.algorithms[algorithmIndex].isGloballyLocked = true;
            await TopicService.findByIdAndUpdate(topicMongoId, { algorithms: topic.algorithms });
            return res.json({ success: true, message: `Algorithm "${algorithm.name}" locked globally.` });

        } else if (userId) {
            const user = await UserService.findById(userId);
            if (!user) return res.status(404).json({ message: 'User not found' });

            const topicProgress = user.progress.get(topic.id);
            if (!topicProgress) { 
                 const algoMap = new Map();
                 algoMap.set(algoId, { status: 'locked', completed: false });
                 user.progress.set(topic.id, { status: 'available', completion: 0, totalTime: 0, algorithms: algoMap });
            } else {
                let algoProgress = topicProgress.algorithms.get(algoId);
                if (!algoProgress) { algoProgress = { status: 'locked', completed: false }; } 
                else { algoProgress.status = 'locked'; } 
                topicProgress.algorithms.set(algoId, algoProgress); 
            }
            
            await UserService.update(user.id, user);
            return res.json({ success: true, message: `Algorithm "${algorithm.name}" locked for user "${user.username}".` });
        } else {
            return res.status(400).json({ message: 'Request must specify "userId" or "global: true".' });
        }
    } catch (error) {
        console.error("Error locking algorithm:", error);
        res.status(500).json({ message: 'Error locking algorithm' });
    }
});

router.post('/topics/:topicMongoId/algorithms/:algoId/unlock', adminAuth, async (req, res) => {
     try {
        const { userId, global } = req.body;
        const { topicMongoId, algoId } = req.params;

        const topic = await TopicService.findById(topicMongoId);
        if (!topic) return res.status(404).json({ message: 'Topic not found' });

        const algorithmIndex = topic.algorithms.findIndex(a => a.id === algoId);
        if (algorithmIndex === -1) return res.status(404).json({ message: `Algorithm '${algoId}' not found in topic '${topic.name}'` });
        const algorithm = topic.algorithms[algorithmIndex];

        if (global) {
            topic.algorithms[algorithmIndex].isGloballyLocked = false;
            await TopicService.findByIdAndUpdate(topicMongoId, { algorithms: topic.algorithms });
            return res.json({ success: true, message: `Algorithm "${algorithm.name}" unlocked globally.` });

        } else if (userId) {
            const user = await UserService.findById(userId);
            if (!user) return res.status(404).json({ message: 'User not found' });

            const topicProgress = user.progress.get(topic.id);
            if (!topicProgress) {
                 const algoMap = new Map();
                 algoMap.set(algoId, { status: 'available', completed: false });
                 user.progress.set(topic.id, { status: 'available', completion: 0, totalTime: 0, algorithms: algoMap });
            } else {
                let algoProgress = topicProgress.algorithms.get(algoId);
                if (algoProgress && algoProgress.status === 'locked') {
                     algoProgress.status = 'available'; 
                     topicProgress.algorithms.set(algoId, algoProgress); 
                } else if (!algoProgress) {
                     algoProgress = { status: 'available', completed: false };
                     topicProgress.algorithms.set(algoId, algoProgress);
                }
            }
            
            await UserService.update(user.id, user);
            return res.json({ success: true, message: `Algorithm "${algorithm.name}" unlocked for user "${user.username}".` });
        } else {
            return res.status(400).json({ message: 'Request must specify "userId" or "global: true".' });
        }
    } catch (error) {
        console.error("Error unlocking algorithm:", error);
        res.status(500).json({ message: 'Error unlocking algorithm' });
    }
});


module.exports = router;