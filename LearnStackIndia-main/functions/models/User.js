// functions/models/User.js - Firestore User Service
const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');
const { getCollection, db } = require('../config/firestore');
// 🚨 TEMPORARY: Keeping Topic import as its structure is still needed for initialization logic.
const Topic = require('./Topic'); 

const USERS_COLLECTION = 'users';
const usersCollection = getCollection(USERS_COLLECTION);

/**
 * Utility to standardize data structure when pulling from Firestore
 * and handles Map/Object conversion which is frequent in your User schema.
 * @param {admin.firestore.DocumentSnapshot} doc 
 */
function mapFirestoreUser(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    
    // Firestore does not support Mongoose's Map type directly, but can handle Objects.
    // However, Mongoose maps nested Maps/Arrays to their types, so we must handle them manually if they exist.
    // For now, we rely on the Firestore data structure being a plain object.
    
    // Restore Map-like behavior for fields like 'progress' and 'socialLinks' which were Maps in Mongoose
    if (data.progress) {
        data.progress = new Map(Object.entries(data.progress));
        // Also map nested 'algorithms' back to Map if they exist
        data.progress.forEach((topic, topicId) => {
            if (topic.algorithms) {
                topic.algorithms = new Map(Object.entries(topic.algorithms));
            }
        });
    }

    // Convert BSON ObjectId to string ID
    const userObject = { id: doc.id, ...data };
    
    // Add "virtuals" (or calculated fields) back as properties
    userObject.fullName = [userObject.profile?.firstName, userObject.profile?.lastName].filter(Boolean).join(' ') || userObject.username;
    userObject.totalAchievements = (userObject.achievements || []).length;
    
    // Helper to run pre-save logic needed for complex updates (like streaks/completion)
    userObject.save = async function() {
        return UserService.updateUser(this.id, this);
    };

    userObject.updateDailyActivity = function(activityData = {}) {
        return UserService.updateDailyActivity(this, activityData);
    };

    userObject.unlockNextTopic = async function() {
        return UserService.unlockNextTopic(this);
    };
    
    // Method to check password (required by auth.js)
    userObject.correctPassword = async function(candidatePassword) {
        // Firestore only returns the hashed password if saved separately or explicitly requested,
        // but since we usually don't save passwords in Firestore for retrieval, this mirrors the Mongoose pattern.
        return bcrypt.compare(candidatePassword, userObject.password);
    };

    userObject.hasAchievement = function(achievementId) {
        return (userObject.achievements || []).some(ach => ach.id === achievementId);
    };

    userObject.awardAchievement = function(template) {
         // This implementation must be rewritten later to avoid fetching the full document on every call.
         // For now, it will be handled as a simplified utility call.
         console.warn("User.awardAchievement called. Requires separate Firestore implementation.");
         return false; // Skip execution for now
    };
    
    userObject.findOrCreateDailyAttempt = function(problemId) {
         // This requires direct array manipulation and will be moved to a helper method on the UserService
         return UserService.findOrCreateDailyAttempt(userObject, problemId);
    };


    return userObject;
}

/**
 * Service class replacing the Mongoose User Model.
 * All methods return a mapped user object or raw data.
 */
class UserService {

    static async findById(id) {
        const doc = await usersCollection.doc(id).get();
        return mapFirestoreUser(doc);
    }

    static async findByEmail(email) {
        // Firestore queries are needed for lookups that aren't by ID
        const snapshot = await usersCollection.where('email', '==', email.toLowerCase()).limit(1).get();
        if (snapshot.empty) return null;
        return mapFirestoreUser(snapshot.docs[0]);
    }
    
    static async findByUsername(username) {
        const snapshot = await usersCollection.where('username', '==', username).limit(1).get();
        if (snapshot.empty) return null;
        return mapFirestoreUser(snapshot.docs[0]);
    }

    /**
     * Creates a new user document in Firestore.
     * Replaces Mongoose's pre-save hooks for initialization and hashing.
     */
    static async createUser(data) {
        // 1. Hashing password
        const hashedPassword = await bcrypt.hash(data.password, 12);
        
        // 2. Initialization logic from Mongoose pre-save hook
        const initialUserData = await UserService.initializeNewUser(data.username, data.email);
        
        // 3. Prepare data for Firestore
        const userData = {
            ...initialUserData,
            ...data,
            password: hashedPassword,
            email: data.email.toLowerCase(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            // Convert Maps in data to plain Objects for Firestore
            progress: Object.fromEntries(initialUserData.progress), 
            profile: { socialLinks: Object.fromEntries(initialUserData.profile.socialLinks) }
        };
        
        const docRef = await usersCollection.add(userData);
        return UserService.findById(docRef.id);
    }
    
    /**
     * Handles updating an existing user (replaces user.save() logic for Mongoose).
     */
    static async update(userId, data) {
         // 1. Filter out virtuals and unnecessary fields
         const updateData = {};
         for (const key in data) {
             if (key !== 'id' && typeof data[key] !== 'function' && key !== 'fullName' && key !== 'totalAchievements') {
                 // Convert Maps back to plain objects for Firestore
                 if (data[key] instanceof Map) {
                    let mapData = Object.fromEntries(data[key]);
                    // Handle nested maps (like algorithms inside progress)
                    if (key === 'progress') {
                        for (const topicId in mapData) {
                            if (mapData[topicId].algorithms instanceof Map) {
                                mapData[topicId].algorithms = Object.fromEntries(mapData[topicId].algorithms);
                            }
                        }
                    }
                    updateData[key] = mapData;
                 } else {
                     updateData[key] = data[key];
                 }
             }
         }
        
         // 2. Handle password hash if modified
         if (data.password && data.isModified && data.isModified('password')) {
            updateData.password = await bcrypt.hash(data.password, 12);
         }
         
         // 3. Perform the update
         await usersCollection.doc(userId).update({
             ...updateData,
             updatedAt: admin.firestore.FieldValue.serverTimestamp()
         });

         return UserService.findById(userId);
    }


    // --- Implementations of Mongoose Instance Methods ---

    static async initializeNewUser(username, email) {
        // Replicates the logic from the Mongoose pre-save hook for new users
        const topics = await Topic.find({ isActive: true }).sort({ order: 1 }).select('id algorithms isGloballyLocked order').lean();
        const topicOrder = [];
        const progressMap = new Map();
        
        topics.forEach(topic => {
            topicOrder.push(topic.id);
            const algoMap = new Map();
            if (topic.algorithms) {
                topic.algorithms.forEach(algo => {
                    algoMap.set(algo.id, { status: 'available', completed: false }); // Minimal algorithm progress
                });
            }
            const initialStatus = topic.isGloballyLocked ? 'locked' : 'available';
            progressMap.set(topic.id, {
                status: initialStatus,
                completion: 0,
                totalTime: 0,
                algorithms: algoMap
            });
        });

        // Default User Document Structure (based on your Mongoose Schema)
        return {
            username: username.trim(),
            email: email.toLowerCase(),
            role: 'user',
            isEmailVerified: false,
            profile: {
                avatar: 'https://placeholder-image-service.onrender.com/image/100x100?prompt=User%20avatar%20profile%20picture%20with%20neutral%20background',
                socialLinks: new Map() 
            },
            stats: {
                overallProgress: 0, rank: { level: 'Bronze', points: 0 },
                timeSpent: { total: 0, today: 0, thisWeek: 0, thisMonth: 0 },
                algorithmsCompleted: 0,
                streak: { current: 0, longest: 0, lastActiveDate: null },
                averageAccuracy: 0
            },
            progress: progressMap, 
            achievements: [], 
            learningPath: {
                currentTopic: topicOrder.length > 0 ? topicOrder[0] : null,
                completedTopics: [],
                topicOrder: topicOrder 
            },
            testAttempts: [],
            dailyProblemAttempts: [],
            preferences: {
                theme: 'light',
                notifications: { email: true, dailyReminder: false, achievementUpdates: true, weeklyReport: false },
                privacy: { showProfile: true, showProgress: true, showOnLeaderboard: true },
                learning: { difficultyPreference: 'any', autoAdvance: true, dailyGoalMinutes: 30 }
            }
        };
    }
    
    // 🚨 NOTE: This method is now simplified. The actual update will rely on the 
    // Mongoose updateDailyActivity logic being replicated here, but we defer 
    // the full logic rewrite for now. The current version only marks the activity.
    static updateDailyActivity(userObject, activityData = {}) {
        // This is where all the complex streak/time logic sits.
        // It's a huge logic rewrite. We keep it as a placeholder until the main conversion.
        console.warn("User.updateDailyActivity called. Full logic rewrite pending.");
        
        // For now, only update the total time/points directly if provided
        const timeIncrementMinutes = activityData.timeSpent || 0;
        if (timeIncrementMinutes > 0) {
            userObject.stats.timeSpent.total = (userObject.stats.timeSpent.total || 0) + timeIncrementMinutes;
        }
        
        return userObject; 
    }
    
    static async unlockNextTopic(userObject) {
         // Replicates the logic from the Mongoose instance method
         console.warn("User.unlockNextTopic called. Full logic rewrite pending.");
         return userObject;
    }
    
    static findOrCreateDailyAttempt(userObject, problemId) {
        // problemId is a Mongoose ObjectId in the original code, but we use a string in Firestore.
        // For now, treat it as a string/ID for simplicity.
        const problemIdStr = problemId.toString();

        if (!userObject.dailyProblemAttempts) {
            userObject.dailyProblemAttempts = [];
        }
        let attempt = userObject.dailyProblemAttempts.find(a => a.problemId === problemIdStr);

        if (!attempt) {
            const newAttempt = {
                problemId: problemIdStr,
                runCount: 0,
                isLocked: false,
                passed: false,
                pointsAwarded: false,
                lastAttemptedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            userObject.dailyProblemAttempts.push(newAttempt);
            // Return the newly pushed object
            attempt = userObject.dailyProblemAttempts[userObject.dailyProblemAttempts.length - 1];
        } else {
            attempt.lastAttemptedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        return attempt;
    }

}

// 🚨 REMINDER: The original Mongoose pre-save logic must be integrated into the createUser and update methods above. 
// We are deferring the full complexity of stat/progress recalculation for now to focus on the structure.

// Export the service class
module.exports = UserService;