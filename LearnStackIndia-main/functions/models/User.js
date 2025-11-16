// models/User.js - Enhanced User Model with Dynamic Progress
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
// Import Topic model to get the total number of algorithms dynamically
const Topic = require('./Topic'); // Assuming Topic model is in the same directory

// --- Sub-schema for Algorithm Progress ---
const algorithmProgressSchema = new mongoose.Schema({
    status: { // <-- ADD THIS
        type: String,
        enum: ['locked', 'available', 'completed'], // Add 'completed' if you track it here, otherwise just locked/available
        default: 'available' // Default to available unless overridden
    },
    completed: { type: Boolean, default: false },
    // Visualization specific
    timeSpentViz: { type: Number, default: 0 }, // in seconds
    lastAttemptViz: Date,
    // Practice specific
    accuracyPractice: { type: Number, default: 0, min: 0, max: 100 },
    bestTimePractice: { type: Number, default: null }, // in seconds, null if no attempt
    attemptsPractice: { type: Number, default: 0 },
    pointsPractice: { type: Number, default: 0 },
    lastAttemptPractice: Date,
    // General
    notes: String
}, { _id: false }); // Disable _id for sub-documents in Map

// --- Sub-schema for Topic Progress ---
const topicProgressSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['locked', 'available', 'in-progress', 'completed'],
        default: 'available'
    },
    completion: { // Percentage completion for this topic
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    totalTime: { // Total time spent on this topic (viz + practice) in minutes
        type: Number,
        default: 0
    },
    algorithms: { // Dynamic Map for algorithms within this topic
        type: Map,
        of: algorithmProgressSchema,
        default: () => new Map() // Ensure new Map is created for each user
    }
}, { _id: false }); // Disable _id for sub-documents in Map

// --- Sub-schema for Earned Achievements ---
const earnedAchievementSchema = new mongoose.Schema({
    id: { type: String, required: true }, // Matches AchievementTemplate id
    name: String,
    description: String,
    icon: String,
    points: Number,
    category: {
        type: String,
        enum: ['learning', 'performance', 'consistency', 'mastery', 'special'],
        required: true
    },
    rarity: {
        type: String,
        enum: ['common', 'rare', 'epic', 'legendary'],
        default: 'common'
    },
    criteria: {
        type: mongoose.Schema.Types.Mixed // Store the criteria it was earned with
    },
    earnedAt: { type: Date, default: Date.now },
    isVisible: { type: Boolean, default: true }
}, { _id: false }); // Disable _id for sub-documents in array

// --- Sub-schema for Daily Activity ---
const dailyActivitySessionSchema = new mongoose.Schema({
    startTime: Date,
    endTime: Date,
    topic: String,
    algorithm: String,
    accuracy: Number,
    timeSpent: Number, // in seconds
    points: Number
}, { _id: false });

const dailyActivitySchema = new mongoose.Schema({
    date: { type: Date, required: true, index: true }, // Index date for faster lookup
    timeSpent: { type: Number, default: 0 }, // minutes
    algorithmsAttempted: { type: Number, default: 0 },
    algorithmsCompleted: { type: Number, default: 0 },
    pointsEarned: { type: Number, default: 0 },
    topicsStudied: [String],
    sessions: [dailyActivitySessionSchema]
}, { _id: false }); // Disable _id for sub-documents in array

// --- NEW: Sub-schema for Test Attempts ---
const testAttemptSchema = new mongoose.Schema({
    testId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Test',
        required: true
    },
    status: {
        type: String,
        enum: ['inprogress', 'locked', 'completed'],
        default: 'inprogress'
    },
    strikes: {
        type: Number,
        default: 0
    },
    score: {
        type: Number,
        default: 0
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: Date
}, { _id: true }); // Enable _id for test attempts to allow direct updates

const dailyProblemAttemptSchema = new mongoose.Schema({
    problemId: { // Reference to the DailyProblem
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DailyProblem',
        required: true
    },
    runCount: { // Tracks the 2-run limit
        type: Number,
        default: 0
    },
    isLocked: { // Locks after 2 failed runs or 1 pass
        type: Boolean,
        default: false
    },
    passed: { // Did they ever pass?
        type: Boolean,
        default: false
    },
    pointsAwarded: { // Tracks if first-attempt points were given
        type: Boolean,
        default: false
    },
    lastSubmittedCode: { // The code for the mentor to review
        type: String
    },
    lastResults: { // e.g., "Passed 3/5 test cases"
        type: String
    },
    mentorFeedback: { // The mentor's suggestion
        type: String,
        default: null
    },
    feedbackRead: {
        type: Boolean,
        default: false
    },
    lastAttemptedAt: { 
        type: Date, 
        default: Date.now 
    }
}, { timestamps: true });

// --- Main User Schema ---
const userSchema = new mongoose.Schema({
    // --- Authentication & Identification ---
    username: {
        type: String, required: [true, 'Username is required'], unique: true, trim: true,
        minlength: [3, 'Username must be at least 3 characters long'], index: true
    },
    email: {
        type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'], index: true
    },
    password: {
        type: String, required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long'], select: false // Hide by default
    },
    role: { 
        type: String, 
        enum: ['user', 'mentor', 'admin'], // <-- MODIFIED: Added 'mentor'
        default: 'user' 
    },

    // --- Verification & Security ---
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    passwordChangedAt: Date,

    // --- Profile ---
    profile: {
        avatar: { type: String, default: 'https://placeholder-image-service.onrender.com/image/100x100?prompt=User%20avatar%20profile%20picture%20with%20neutral%20background' },
        firstName: { type: String, trim: true },
        lastName: { type: String, trim: true },
        bio: { type: String, trim: true, maxlength: 200 },
        location: { type: String, trim: true },
        website: { type: String, trim: true },
        socialLinks: { // Dynamic Map for social links
            type: Map,
            of: String,
            default: () => new Map()
        }
    },

    // --- Progress & Stats ---
    progress: { // Dynamic Map for topics
        type: Map,
        of: topicProgressSchema,
        default: () => new Map()
    },
    stats: {
        overallProgress: { type: Number, default: 0, min: 0, max: 100 },
        rank: {
            level: { type: String, enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'], default: 'Bronze' },
            points: { type: Number, default: 0, index: true } // Index points for leaderboard
        },
        timeSpent: { // All in minutes
            total: { type: Number, default: 0 },
            today: { type: Number, default: 0 },
            thisWeek: { type: Number, default: 0 },
            thisMonth: { type: Number, default: 0 }
        },
        algorithmsCompleted: { type: Number, default: 0 },
        // Removed totalAlgorithms from stats, will calculate dynamically
        streak: {
            current: { type: Number, default: 0 },
            longest: { type: Number, default: 0 },
            lastActiveDate: Date
        },
        averageAccuracy: { type: Number, default: 0, min: 0, max: 100 }
        // Removed averageTime, can be calculated if needed
    },

    // --- Achievements ---
    achievements: { // Single array for all earned achievements
        type: [earnedAchievementSchema],
        default: []
    },

    // --- Learning Path ---
    learningPath: {
        currentTopic: { type: String, default: null }, // Store topic ID, null if not started
        // Removed currentAlgorithm, can be derived
        completedTopics: { type: [String], default: [] }, // Array of topic IDs
        topicOrder: { type: [String], default: [] }, // Will be populated from Topic model
        // Removed customPath and preferences from here, moved to main preferences
    },
    
    // --- NEW: Test Attempts ---
    testAttempts: [testAttemptSchema],
    dailyProblemAttempts: [dailyProblemAttemptSchema],

    // --- Activity & Preferences ---
    dailyActivity: {
        type: [dailyActivitySchema],
        default: []
        // Consider limiting the size of this array in production (e.g., keep last 90 days)
    },
    preferences: {
        theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' },
        notifications: {
            email: { type: Boolean, default: true },
            // Removed push notifications for simplicity
            dailyReminder: { type: Boolean, default: false },
            achievementUpdates: { type: Boolean, default: true },
            weeklyReport: { type: Boolean, default: false }
        },
        privacy: {
            showProfile: { type: Boolean, default: true },
            showProgress: { type: Boolean, default: true },
            showOnLeaderboard: { type: Boolean, default: true }
        },
        learning: {
            difficultyPreference: { type: String, enum: ['easy', 'medium', 'hard', 'any'], default: 'any' },
            autoAdvance: { type: Boolean, default: true },
            dailyGoalMinutes: { type: Number, default: 30 }
        }
    }
}, {
    timestamps: true, // Adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// --- VIRTUALS ---

userSchema.virtual('fullName').get(function () {
    return [this.profile.firstName, this.profile.lastName].filter(Boolean).join(' ') || this.username;
});

userSchema.virtual('totalAchievements').get(function () {
    return this.achievements.length;
});

// Virtual to calculate completion percentage dynamically
userSchema.virtual('completionPercentage').get(function () {
    let totalAlgorithms = 0;
    let completedAlgorithms = 0;

    this.progress.forEach((topicProgress) => {
        topicProgress.algorithms.forEach((algoProgress) => {
            totalAlgorithms++;
            if (algoProgress.completed) {
                completedAlgorithms++;
            }
        });
    });

    // Handle division by zero if there are no algorithms tracked yet
    return totalAlgorithms > 0 ? Math.round((completedAlgorithms / totalAlgorithms) * 100) : 0;
});


// --- MIDDLEWARE ---

// Password Hashing & Stat Updates before saving
userSchema.pre('save', async function (next) {
    console.log(`[User Pre-Save] Running for: ${this.username}`); // Debug log

    // Hash password if modified
    if (this.isModified('password')) {
        console.log('[User Pre-Save] Hashing password...');
        this.password = await bcrypt.hash(this.password, 12);
        if (!this.isNew) { // Don't clear tokens for initial registration
            this.passwordResetToken = undefined;
            this.passwordResetExpires = undefined;
        }
    }

    // --- Dynamic Initialization of Progress & Learning Path on NEW user ---
    if (this.isNew) {
        console.log('[User Pre-Save] Initializing progress for new user...');
        
        console.log('[User Pre-Save] Initializing default stats and learningPath...');
        if (!this.stats) { this.stats = {}; } // Ensure stats object itself exists
        this.stats.rank = { level: 'Bronze', points: 0 };
        this.stats.streak = { current: 0, longest: 0, lastActiveDate: null };
        this.stats.timeSpent = { total: 0, today: 0, thisWeek: 0, thisMonth: 0 };
        
        if (!this.learningPath) { this.learningPath = {}; } // <-- Fixes "cannot set topicOrder of undefined"

        try {
            // This require is already at the top of the file
            // const Topic = require('./Topic'); 
            
            const topics = await Topic.find({ isActive: true }).sort({ order: 1 }).select('id algorithms isGloballyLocked order').lean();
            const topicOrder = [];
            
            topics.forEach(topic => {
                topicOrder.push(topic.id);
                const algoMap = new Map();
                if (topic.algorithms) { // Check if algorithms exists
                    topic.algorithms.forEach(algo => {
                        algoMap.set(algo.id, {});
                    });
                }
                const initialStatus = topic.isGloballyLocked ? 'locked' : 'available';
                this.progress.set(topic.id, {
                    status: initialStatus,
                    completion: 0,
                    totalTime: 0,
                    algorithms: algoMap
                });
            });
            
            this.learningPath.topicOrder = topicOrder; 
            this.learningPath.currentTopic = topicOrder.length > 0 ? topicOrder[0] : null;
            
            console.log(`[User Pre-Save] Initialized progress for ${topics.length} topics. Current: ${this.learningPath.currentTopic}`);
        } catch (error) {
            console.error('[User Pre-Save] Error initializing progress:', error);
            // Pass the error to stop the save operation
            return next(new Error('Failed to initialize user topics: ' + error.message));
        }
    }

    // --- Recalculate derived stats ONLY IF progress is modified ---
    // --- *** THIS IS THE FIX FOR PROBLEM 2 *** ---
    if (!this.isNew && this.isModified('progress')) {
        console.log('[User Pre-Save] Recalculating derived stats because progress was modified...');
        
        // Safety checks for existing users who might have null stats
        if (!this.stats) { this.stats = {}; } 
        if (!this.stats.rank) { this.stats.rank = { level: 'Bronze', points: 0 }; }
        if (!this.stats.streak) { this.stats.streak = { current: 0, longest: 0, lastActiveDate: null }; }
        if (!this.stats.timeSpent) { this.stats.timeSpent = { total: 0, today: 0, thisWeek: 0, thisMonth: 0 }; }
        if (!this.learningPath) { this.learningPath = { completedTopics: [] }; }

        
        // --- *** NEW: FETCH TOPIC DEFINITIONS *** ---
        let topicDefinitions;
        let topicAlgoCountMap = new Map();
        let totalDefinedAlgorithms = 0;
        try {
            // This require is already at the top of the file
            // const Topic = require('./Topic'); 
            topicDefinitions = await Topic.find({ isActive: true }).select('id algorithms').lean();
            topicDefinitions.forEach(topic => {
                const count = topic.algorithms ? topic.algorithms.length : 0;
                topicAlgoCountMap.set(topic.id, count);
                totalDefinedAlgorithms += count;
            });
        } catch (e) {
            console.error("[User Pre-Save] CRITICAL: Could not fetch Topic definitions to calculate progress.", e);
            // Don't block save, but stats will be wrong
            totalDefinedAlgorithms = -1; // Flag error
        }
        // --- *** END NEW FETCH *** ---


        let totalCompleted = 0;
        let totalTrackedAlgos = 0;
        let totalAccuracySum = 0;
        let practiceAlgoCount = 0;
        let totalTopicCompletionSum = 0;
        let activeTopicCount = 0; 

        this.progress.forEach((topicProgress, topicId) => {
            let topicCompletedAlgos = 0;
            // --- *** THE FIX *** ---
            // Get the *defined* total, not the *tracked* total
            let topicTotalAlgos = topicAlgoCountMap.get(topicId) || 0; 
            // --- *** END FIX *** ---

            if (topicProgress.algorithms && topicProgress.algorithms.size > 0) {
                // We still count active topics based on user progress
                if (topicTotalAlgos > 0) { // Only count topics that still exist
                     activeTopicCount++;
                }
                
                topicProgress.algorithms.forEach((algoProgress) => {
                    totalTrackedAlgos++; // This is fine (total *tracked* algos)
                    if (algoProgress.completed) {
                        topicCompletedAlgos++;
                        totalCompleted++;
                    }
                    if (algoProgress.attemptsPractice > 0) {
                        totalAccuracySum += algoProgress.accuracyPractice;
                        practiceAlgoCount++;
                    }
                });

                // --- *** THE FIX *** ---
                // Use the correct denominator
                topicProgress.completion = topicTotalAlgos > 0 ? Math.round((topicCompletedAlgos / topicTotalAlgos) * 100) : 0;
                totalTopicCompletionSum += topicProgress.completion;

                if (topicProgress.status !== 'locked') {
                    if (topicProgress.completion === 100 && topicTotalAlgos > 0) { // Add check for algos > 0
                        topicProgress.status = 'completed';
                        if (!this.learningPath.completedTopics.includes(topicId)) {
                            this.learningPath.completedTopics.push(topicId);
                            this.markModified('learningPath.completedTopics');
                        }
                    } else if (topicProgress.completion > 0 && topicProgress.status === 'available') {
                        topicProgress.status = 'in-progress';
                    }
                }
            } else {
                topicProgress.completion = 0; // No progress, 0%
            }
        });

        this.stats.algorithmsCompleted = totalCompleted;

        // --- *** THE FIX for OverallProgress *** ---
        // Calculate as (Total Completed Algos / Total Defined Algos)
        if (totalDefinedAlgorithms > 0) {
             this.stats.overallProgress = Math.round((totalCompleted / totalDefinedAlgorithms) * 100);
        } else if (totalDefinedAlgorithms === 0) {
             this.stats.overallProgress = 100; // No algos defined, 100% complete
        } else {
             // Error case, fallback to old (safer) method
             this.stats.overallProgress = activeTopicCount > 0 ? Math.round(totalTopicCompletionSum / activeTopicCount) : 0;
        }
        // --- *** END FIX *** ---


        this.stats.averageAccuracy = practiceAlgoCount > 0 ? Math.round(totalAccuracySum / practiceAlgoCount) : 0;

        console.log(`[User Pre-Save] Stats updated: Completed=${totalCompleted}, Overall%=${this.stats.overallProgress}, AvgAcc%=${this.stats.averageAccuracy}`);

        this.updateRank(); // updateRank now marks modified
        console.log(`[User Pre-Save] Rank updated: Level=${this.stats.rank.level}, Points=${this.stats.rank.points}`);

        this.markModified('progress');
        
    } else if (!this.isNew) {
        console.log('[User Pre-Save] Skipping stats recalculation (progress not modified).');
    }

    next();
});
// --- INSTANCE METHODS ---

// Check password
userSchema.methods.correctPassword = async function (candidatePassword) {
    // Ensure password was selected when fetching user
    if (!this.password) {
        console.error(`Password not selected for user ${this.username} during correctPassword check.`);
        return false;
    }
    return await bcrypt.compare(candidatePassword, this.password);
};

// Update daily activity & streak
// backend/models/User.js

userSchema.methods.updateDailyActivity = function (activityData = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day UTC

    // Find or create today's activity record
    let todayActivity = this.dailyActivity.find(activity =>
        activity.date instanceof Date && activity.date.getTime() === today.getTime()
    );

    let isNewDayRecord = false;
    if (!todayActivity) {
        todayActivity = { date: today, timeSpent: 0, algorithmsAttempted: 0, algorithmsCompleted: 0, pointsEarned: 0, topicsStudied: [], sessions: [] };
        this.dailyActivity.push(todayActivity);
        isNewDayRecord = true;
    }

    // Increment activity data
    const timeIncrementMinutes = activityData.timeSpent || 0;
    todayActivity.timeSpent += timeIncrementMinutes;
    todayActivity.algorithmsAttempted += activityData.algorithmsAttempted || 0;
    todayActivity.algorithmsCompleted += activityData.algorithmsCompleted || 0;
    todayActivity.pointsEarned += activityData.pointsEarned || 0;

    if (activityData.topic && !todayActivity.topicsStudied.includes(activityData.topic)) {
        todayActivity.topicsStudied.push(activityData.topic);
    }
    if (activityData.session) {
        todayActivity.sessions.push(activityData.session);
    }

    // --- FIX: Ensure stats and sub-objects exist ---
    if (!this.stats) { this.stats = {}; }
    if (!this.stats.timeSpent) { this.stats.timeSpent = { total: 0, today: 0, thisWeek: 0, thisMonth: 0 }; }
    if (!this.stats.streak) { this.stats.streak = { current: 0, longest: 0, lastActiveDate: null }; }
    // --- END FIX ---

    // --- Update timeSpent stats ---
    this.stats.timeSpent.today = todayActivity.timeSpent; // Update today's total
    this.stats.timeSpent.total = (this.stats.timeSpent.total || 0) + timeIncrementMinutes; // Increment overall total

    // --- Update Streak ---
    const lastActive = this.stats.streak.lastActiveDate; // Now safe
    let daysDiff = -1; // Default to indicate no previous date or large gap

    if (lastActive) {
        const lastActiveDay = new Date(lastActive);
        lastActiveDay.setHours(0, 0, 0, 0); // Normalize
        daysDiff = Math.floor((today.getTime() - lastActiveDay.getTime()) / (1000 * 60 * 60 * 24));
    }

    if (daysDiff !== 0) { // Only update streak if it's a new day or first activity
        if (daysDiff === 1) { // Consecutive day
            this.stats.streak.current = (this.stats.streak.current || 0) + 1;
        } else { // First activity ever, or streak broken
            this.stats.streak.current = 1;
        }
        this.stats.streak.lastActiveDate = today; // Update last active date
        // Update longest streak
        if (this.stats.streak.current > (this.stats.streak.longest || 0)) {
            this.stats.streak.longest = this.stats.streak.current;
        }
        this.markModified('stats.streak'); // Mark streak as modified
    }

    this.markModified('dailyActivity'); // Mark the array as modified
    this.markModified('stats.timeSpent'); // Mark timeSpent as modified
};

// Update user rank based on points
userSchema.methods.updateRank = function () {
    // --- FIX: Ensure stats and rank objects exist ---
    if (!this.stats) {
        this.stats = {};
    }
    if (!this.stats.rank) {
        this.stats.rank = { level: 'Bronze', points: 0 };
    }
    // --- END FIX ---

    const points = this.stats.rank.points || 0;
    let newLevel = 'Bronze'; // Default

    // Define rank thresholds (could be moved to config)
    const thresholds = { Diamond: 10000, Platinum: 5000, Gold: 2000, Silver: 500, Bronze: 0 };

    if (points >= thresholds.Diamond) newLevel = 'Diamond';
    else if (points >= thresholds.Platinum) newLevel = 'Platinum';
    else if (points >= thresholds.Gold) newLevel = 'Gold';
    else if (points >= thresholds.Silver) newLevel = 'Silver';

    if (this.stats.rank.level !== newLevel) {
        console.log(`[User UpdateRank] Rank changed for ${this.username}: ${this.stats.rank.level} -> ${newLevel}`);
        this.stats.rank.level = newLevel;
        this.markModified('stats.rank'); // Mark rank as modified
    }
};

// Unlock the next topic if prerequisites are met
userSchema.methods.unlockNextTopic = async function () {
    console.log(`[User UnlockNext] Checking for ${this.username}...`);
    const currentTopicId = this.learningPath.currentTopic;
    const topicOrder = this.learningPath.topicOrder;
    const completedTopicsSet = new Set(this.learningPath.completedTopics);

    if (!currentTopicId || !topicOrder || topicOrder.length === 0) {
        console.log('[User UnlockNext] No current topic or topic order defined.');
        return;
    }

    const currentIndex = topicOrder.indexOf(currentTopicId);

    // Find the next topic in the defined order
    let nextTopicId = null;
    if (currentIndex >= 0 && currentIndex < topicOrder.length - 1) {
        nextTopicId = topicOrder[currentIndex + 1];
    }

    if (!nextTopicId) {
        console.log('[User UnlockNext] Already at the last topic or invalid current topic index.');
        return;
    }

    const nextTopicProgress = this.progress.get(nextTopicId);

    // Check if the next topic exists in progress and is currently locked
    if (nextTopicProgress && nextTopicProgress.status === 'locked') {
        console.log(`[User UnlockNext] Next topic is ${nextTopicId}. Checking prerequisites...`);

        // --- Prerequisite Check ---
        // Fetch the next topic's definition to check its prerequisites
        const nextTopicDef = await Topic.findOne({ id: nextTopicId }).select('prerequisites').lean();

        let prerequisitesMet = true;
        if (nextTopicDef && nextTopicDef.prerequisites && nextTopicDef.prerequisites.length > 0) {
            prerequisitesMet = nextTopicDef.prerequisites.every(prereqId =>
                completedTopicsSet.has(prereqId) && (this.progress.get(prereqId)?.completion === 100)
            );
            console.log(`[User UnlockNext] Prerequisites for ${nextTopicId}: ${nextTopicDef.prerequisites.join(', ')}. Met: ${prerequisitesMet}`);
        } else {
            console.log(`[User UnlockNext] No prerequisites defined for ${nextTopicId}.`);
        }
        // --- End Prerequisite Check ---

        if (prerequisitesMet) {
            console.log(`[User UnlockNext] Prerequisites met. Unlocking topic: ${nextTopicId}`);
            nextTopicProgress.status = 'available';
            this.progress.set(nextTopicId, nextTopicProgress); // Update the map entry
            this.markModified('progress'); // Mark the entire progress map as modified
            console.log(`[User UnlockNext] Topic ${nextTopicId} status set to 'available'.`);
        } else {
            console.log(`[User UnlockNext] Prerequisites not yet met for ${nextTopicId}.`);
        }
    } else if (nextTopicProgress) {
        console.log(`[User UnlockNext] Next topic ${nextTopicId} is already unlocked (Status: ${nextTopicProgress.status}).`);
    } else {
        console.warn(`[User UnlockNext] Next topic ${nextTopicId} not found in user's progress map.`);
        // Optionally, initialize it here if needed, though pre-save should handle initial setup.
    }

    // --- Update Current Topic ---
    // If the *current* topic is completed, advance the currentTopic pointer
    const currentTopicProgress = this.progress.get(currentTopicId);
    if (currentTopicProgress && currentTopicProgress.completion === 100 && nextTopicId) {
        // Only advance if the next topic is now available (or was already available)
        const nextStatus = this.progress.get(nextTopicId)?.status;
        if (nextStatus === 'available' || nextStatus === 'in-progress' || nextStatus === 'completed') {
            this.learningPath.currentTopic = nextTopicId;
            this.markModified('learningPath');
            console.log(`[User UnlockNext] Advanced current topic to: ${nextTopicId}`);
        } else {
            console.log(`[User UnlockNext] Current topic ${currentTopicId} completed, but next topic ${nextTopicId} is still locked. Not advancing.`);
        }
    } else {
        console.log(`[User UnlockNext] Current topic ${currentTopicId} not completed or no next topic. Not advancing.`);
    }
};

// Award an achievement if not already earned
userSchema.methods.awardAchievement = function (achievementTemplate) {
    if (!achievementTemplate || !achievementTemplate.id) {
        console.error("[AwardAchievement] Invalid achievement template provided.");
        return false; // Indicate failure
    }

    // Check if achievement already earned (more efficient check)
    if (this.achievements.some(ach => ach.id === achievementTemplate.id)) {
        // console.log(`[AwardAchievement] Achievement ${achievementTemplate.id} already earned by ${this.username}.`);
        return false; // Indicate already earned
    }

    // Create the earned achievement object
    const earnedAchievement = {
        id: achievementTemplate.id,
        name: achievementTemplate.name,
        description: achievementTemplate.description,
        icon: achievementTemplate.icon,
        points: achievementTemplate.points,
        category: achievementTemplate.category,
        rarity: achievementTemplate.rarity || 'common',
        criteria: achievementTemplate.criteria, // Store criteria for context
        earnedAt: new Date(),
        isVisible: true
    };

    // Add to the achievements array
    this.achievements.push(earnedAchievement);
    this.markModified('achievements'); // Mark the array as modified

    // Add points to user's rank
    this.stats.rank.points = (this.stats.rank.points || 0) + achievementTemplate.points;
    this.updateRank(); // Update rank level (marks stats.rank modified)

    console.log(`[AwardAchievement] Awarded achievement "${achievementTemplate.name}" (+${achievementTemplate.points} points) to ${this.username}.`);
    return true; // Indicate success
};

// Method to check if a specific achievement has been earned
userSchema.methods.hasAchievement = function (achievementId) {
    return this.achievements.some(ach => ach.id === achievementId);
};

// --- *** ADD THIS NEW METHOD *** ---
userSchema.methods.findOrCreateDailyAttempt = function(problemId) {
    if (!this.dailyProblemAttempts) {
        this.dailyProblemAttempts = [];
    }
    let attempt = this.dailyProblemAttempts.find(a => a.problemId.equals(problemId));

    if (!attempt) {
        // Create a new one
        const newAttempt = {
            problemId: problemId,
            runCount: 0,
            isLocked: false,
            passed: false,
            pointsAwarded: false,
            lastAttemptedAt: new Date()
        };
        this.dailyProblemAttempts.push(newAttempt);
        // Get the Mongoose-managed sub-document
        attempt = this.dailyProblemAttempts[this.dailyProblemAttempts.length - 1];
    } else {
        // Update timestamp on existing attempt
        attempt.lastAttemptedAt = new Date();
    }
    return attempt;
};

module.exports = mongoose.model('User', userSchema);
