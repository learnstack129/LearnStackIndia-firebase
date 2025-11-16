// functions/routes/test.js - MODIFIED to use Services

const express = require('express');
const auth = require('../middleware/auth');
const UserService = require('../models/User'); // <-- Use UserService
const TestService = require('../models/Test'); // <-- Use TestService
const QuestionService = require('../models/Question'); // <-- Use QuestionService
// We use a simplified ObjectId generator for consistency in Firestore arrays
const mongoose = require('mongoose'); // Re-import mongoose for ObjectId generation

const router = express.Router();

// --- Helper: Get or Create Test Attempt ---
// NOTE: This helper is now simpler and more direct for Firestore arrays.
async function getOrCreateAttempt(userId, testId) {
    let user = await UserService.findById(userId);
    if (!user) throw new Error('User not found');

    let attempt = (user.testAttempts || []).find(a => a.testId === testId);

    if (!attempt) {
        // Simulating the Mongoose structure for the subdocument array
        const newAttempt = {
            testId: testId,
            status: 'inprogress',
            strikes: 0,
            score: 0,
            startedAt: new Date().toISOString(),
            // Generate a fake Mongoose ObjectId string ID for consistency with the frontend/mentor routes
            _id: new mongoose.Types.ObjectId().toHexString() 
        };
        // Add new attempt to the array
        user.testAttempts = [...(user.testAttempts || []), newAttempt];
        
        // Save the updated array back to Firestore
        await UserService.update(user.id, user);

        // Re-fetch the user to ensure data is consistent and mapped correctly
        user = await UserService.findById(userId);
        attempt = (user.testAttempts || []).find(a => a.testId === testId);
    }
    
    return { user, attempt };
}

// --- NEW ROUTE: Get all active tests for the dashboard list ---
router.get('/active', auth, async (req, res) => {
    try {
        const tests = await TestService.find({ isActive: true }); 

        // Manually fetch creator username for each test
        const createdByIds = [...new Set(tests.map(t => t.createdBy))];
        const userPromises = createdByIds.map(id => UserService.findById(id));
        const users = await Promise.all(userPromises);
        const userMap = new Map(users.filter(u => u).map(u => [u.id, u]));

        const testsWithCreators = tests.map(test => ({
             _id: test._id,
             title: test.title,
             createdBy: {
                 username: userMap.get(test.createdBy)?.username || 'N/A'
             }
        }));

        res.json({ success: true, tests: testsWithCreators });
    } catch (error) {
        console.error("Error fetching active tests:", error);
        res.status(500).json({ message: 'Server error fetching active tests' });
    }
});


// POST /api/test/start/:testId
router.post('/start/:testId', auth, async (req, res) => {
    try {
        const { testId } = req.params;
        const { password } = req.body;
        const userId = req.user.id;

        if (!password) {
            return res.status(400).json({ message: 'Password is required' });
        }
        
        const test = await TestService.findById(testId);
        if (!test) return res.status(404).json({ message: 'Test not found' });
        
        if (!test.isActive) {
            return res.status(403).json({ message: 'This test is not currently active.' });
        }

        const isMatch = await test.correctPassword(password);
        if (!isMatch) {
            return res.status(403).json({ message: 'Invalid test password' });
        }

        // Get or create the user's attempt record
        const { user, attempt } = await getOrCreateAttempt(userId, testId);
        
        if (attempt.status === 'locked') {
            return res.status(403).json({ 
                message: 'Your test is locked due to violations. Please contact your mentor.',
                status: 'locked'
            });
        }
        
        // Load questions manually (since we can't populate)
        const questionPromises = (test.questions || []).map(id => QuestionService.findById(id));
        const questions = (await Promise.all(questionPromises)).filter(q => q);
        
        const firstQuestion = questions[0];
        
        if (!firstQuestion) {
             return res.status(404).json({ message: 'This test has no questions.' });
        }

        res.json({
            success: true,
            message: 'Test started.',
            testTitle: test.title,
            attemptId: attempt._id,
            strikes: attempt.strikes,
            currentQuestion: firstQuestion, 
            totalQuestions: questions.length
        });

    } catch (error) {
        console.error("Error starting test:", error);
        res.status(500).json({ message: error.message || 'Server error starting test' });
    }
});

// POST /api/test/violation
router.post('/violation', auth, async (req, res) => {
    try {
        const { attemptId } = req.body;
        const userId = req.user.id;
        
        let user = await UserService.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Find attempt using the temporary _id string
        const attempt = (user.testAttempts || []).find(a => a._id === attemptId);
        
        if (!attempt) return res.status(404).json({ message: 'Test attempt not found' });
        if (attempt.status !== 'inprogress') {
            return res.status(400).json({ message: `Test is not in progress (status: ${attempt.status})` });
        }

        attempt.strikes = (attempt.strikes || 0) + 1;
        
        let newStatus = attempt.status;
        let message = `Violation #${attempt.strikes} logged.`;

        if (attempt.strikes >= 3) {
            attempt.status = 'locked';
            newStatus = 'locked';
            message = '3-strike limit reached. Test has been locked.';
        }
        
        // Find index and update array (essential for Firestore)
        const attemptIndex = user.testAttempts.findIndex(a => a._id === attemptId);
        if (attemptIndex !== -1) {
            user.testAttempts[attemptIndex] = attempt;
        } else {
            throw new Error("Attempt ID mismatch on user object during update.");
        }

        await UserService.update(user.id, user);
        
        res.json({
            success: true,
            strikes: attempt.strikes,
            status: newStatus,
            message: message
        });

    } catch (error) {
        console.error("Error logging violation:", error);
        res.status(500).json({ message: error.message || 'Server error logging violation' });
    }
});


// POST /api/test/submit
router.post('/submit', auth, async (req, res) => {
     try {
        const { attemptId, questionId, answer } = req.body;
        const userId = req.user.id;

        let user = await UserService.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        const attempt = (user.testAttempts || []).find(a => a._id === attemptId);
        if (!attempt) return res.status(404).json({ message: 'Test attempt not found' });
        if (attempt.status !== 'inprogress') {
            return res.status(403).json({ message: 'Test is locked or completed.' });
        }

        const question = await QuestionService.findById(questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });

        // --- Check Answer ---
        let isCorrect = false;
        if (question.questionType === 'mcq') {
            isCorrect = (parseInt(answer, 10) === question.correctAnswerIndex);
        } else if (question.questionType === 'short_answer') {
            const userAns = (answer || '').trim().toLowerCase();
            isCorrect = question.shortAnswers.some(sa => sa.trim().toLowerCase() === userAns);
        }
        
        if (isCorrect) {
            attempt.score = (attempt.score || 0) + 10; 
        }
        
        // Find index and update array 
        const attemptIndex = user.testAttempts.findIndex(a => a._id === attemptId);
        if (attemptIndex !== -1) {
            user.testAttempts[attemptIndex] = attempt;
        }

        await UserService.update(user.id, user); // Save points

        // --- Find Next Question ---
        const test = await TestService.findById(attempt.testId); 
        
        // Load questions (manual lookup since we can't populate)
        const questionPromises = (test.questions || []).map(id => QuestionService.findById(id));
        const questions = (await Promise.all(questionPromises)).filter(q => q);
        
        // Find current and next question index
        const currentQuestionIndex = questions.findIndex(q => q._id === questionId);
        
        let nextQuestion = null;
        if (currentQuestionIndex !== -1 && currentQuestionIndex < questions.length - 1) {
            nextQuestion = questions[currentQuestionIndex + 1];
        }

        if (!nextQuestion) {
            // This was the last question
            attempt.status = 'completed';
            attempt.completedAt = new Date().toISOString();
            
            // Re-update the attempt array with the final status before saving
            const finalAttemptIndex = user.testAttempts.findIndex(a => a._id === attemptId);
            if (finalAttemptIndex !== -1) {
                user.testAttempts[finalAttemptIndex] = attempt;
            }

            await UserService.update(user.id, user);
            
            return res.json({
                success: true,
                isCorrect: isCorrect,
                correctAnswer: question.questionType === 'mcq' ? question.correctAnswerIndex : question.shortAnswers[0],
                testComplete: true,
                finalScore: attempt.score
            });
        }
        
        // Send next question
        res.json({
            success: true,
            isCorrect: isCorrect,
            correctAnswer: question.questionType === 'mcq' ? question.correctAnswerIndex : question.shortAnswers[0],
            testComplete: false,
            nextQuestion: nextQuestion
        });

    } catch (error) {
        console.error("Error submitting answer:", error);
        res.status(500).json({ message: error.message || 'Server error submitting answer' });
    }
});


module.exports = router;