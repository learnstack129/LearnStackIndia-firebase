// backend/utils/accessControl.js
const User = require('../models/User');
const Topic = require('../models/Topic');

/**
 * Checks if a user has access to a given subject.
 * A subject is considered "accessible" if at least one topic
 * within that subject is not in a 'locked' state for the user.
 * @param {string} userId - The MongoDB ObjectId of the user.
 * @param {string} subjectName - The name of the subject (e.g., "DSA Visualizer").
 * @returns {boolean} - True if accessible, false if not.
 */
async function checkSubjectAccess(userId, subjectName) {
    try {
        // 1. Fetch user progress and all topics for this subject
        const [user, topicsInSubject] = await Promise.all([
            User.findById(userId).select('progress learningPath').lean(),
            Topic.find({ subject: subjectName }).select('id isGloballyLocked prerequisites').lean()
        ]);

        if (!user) {
            throw new Error('User not found in checkSubjectAccess');
        }

        // 2. If subject has no topics, it's not accessible
        if (topicsInSubject.length === 0) {
            return false;
        }

        const userProgressMap = new Map(Object.entries(user.progress || {}));
        const completedTopicsSet = new Set(user.learningPath?.completedTopics || []);

        // 3. Check if *any* topic in this subject is NOT 'locked'
        const isSubjectAccessible = topicsInSubject.some(topic => {
            const userProgressForTopic = userProgressMap.get(topic.id);
            
            // Check prerequisites
            let prereqsMet = true;
            if (topic.prerequisites && topic.prerequisites.length > 0) {
                prereqsMet = topic.prerequisites.every(prereqId => completedTopicsSet.has(prereqId));
            }

            // Get user-specific status from their progress map
            let userSpecificStatus;
            if (userProgressForTopic?.status) {
                userSpecificStatus = userProgressForTopic.status;
            } else {
                // If no entry, default status depends on global lock
                userSpecificStatus = topic.isGloballyLocked ? 'locked' : 'available';
            }
            
            // Determine final effective status
            let finalEffectiveStatus = 'available'; // Start optimistic
            
            if (topic.isGloballyLocked) {
                // If globally locked, only a user-specific 'available' (admin override) unlocks it
                finalEffectiveStatus = (userSpecificStatus === 'available') ? 'available' : 'locked';
            } else if (!prereqsMet) {
                // If prereqs not met, it's locked (unless admin unlocked it)
                // --- THIS IS THE FIX ---
                finalEffectiveStatus = (userSpecificStatus === 'available') ? 'available' : 'locked';
            } else {
                // Not globally locked, prereqs met. Status is the user's status.
                finalEffectiveStatus = userSpecificStatus;
            }

            // If this topic is not locked, the subject is accessible
            return finalEffectiveStatus !== 'locked';
        });
        
        return isSubjectAccessible;

    } catch (error) {
        console.error(`Error in checkSubjectAccess for user ${userId}, subject ${subjectName}:`, error);
        return false; // Default to not accessible on error
    }
}

module.exports = { checkSubjectAccess };
