// functions/utils/accessControl.js - Final version using converted Services

const UserService = require('../models/User'); 
const TopicService = require('../models/Topic'); 

/**
 * Checks if a user has access to a given subject.
 * @param {string} userId - The Firestore Document ID of the user.
 * @param {string} subjectName - The name of the subject.
 * @returns {boolean} - True if accessible, false if not.
 */
async function checkSubjectAccess(userId, subjectName) {
    try {
        const [user, topicsInSubject] = await Promise.all([
            UserService.findById(userId),
            TopicService.find({ subject: subjectName })
        ]);

        if (!user) {
            throw new Error('User not found in checkSubjectAccess');
        }

        if (topicsInSubject.length === 0) {
            return false;
        }

        const userProgressMap = user.progress; 
        const completedTopicsSet = new Set(user.learningPath?.completedTopics || []);

        const isSubjectAccessible = topicsInSubject.some(topic => {
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
            
            let finalEffectiveStatus = 'available'; 
            
            if (topic.isGloballyLocked) {
                finalEffectiveStatus = (userSpecificStatus === 'available' || userSpecificStatus === 'in-progress' || userSpecificStatus === 'completed') ? userSpecificStatus : 'locked';
            } else if (!prereqsMet) {
                finalEffectiveStatus = (userSpecificStatus === 'available' || userSpecificStatus === 'in-progress' || userSpecificStatus === 'completed') ? userSpecificStatus : 'locked';
            } else {
                finalEffectiveStatus = userSpecificStatus;
            }

            return finalEffectiveStatus !== 'locked';
        });
        
        return isSubjectAccessible;

    } catch (error) {
        console.error(`Error in checkSubjectAccess for user ${userId}, subject ${subjectName}:`, error);
        return false;
    }
}

module.exports = { checkSubjectAccess };