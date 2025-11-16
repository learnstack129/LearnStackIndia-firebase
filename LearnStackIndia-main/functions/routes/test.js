// backend/routes/test.js
const express = require('express');
const auth = require('../middleware/auth'); // Standard user auth
const User = require('../models/User'); // <-- MOVED UP
const Test = require('../models/Test');
const Question = require('../models/Question');
const mongoose = require('mongoose');
const router = express.Router();

// --- Helper: Get or Create Test Attempt ---
async function getOrCreateAttempt(userId, testId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    let attempt = user.testAttempts.find(a => a.testId.toString() === testId.toString());

    if (!attempt) {
        // Create new attempt if one doesn't exist
        const newAttempt = {
            testId: testId,
            status: 'inprogress',
            strikes: 0,
            score: 0,
            startedAt: new Date()
        };
        user.testAttempts.push(newAttempt);
        await user.save();
        // Re-fetch the newly created subdocument to get its _id
        const updatedUser = await User.findById(userId);
        attempt = updatedUser.testAttempts.find(a => a.testId.toString() === testId.toString());
    }
    
    return { user, attempt };
}

// --- NEW ROUTE: Get all active tests for the dashboard list ---
// GET /api/test/active
router.get('/active', auth, async (req, res) => {
    try {
        // --- NEW FIX #2 ---
        // The screenshot confirms 'createdBy' is a valid ObjectId, not null.
        // This means the 'populate' is failing because that ObjectId
        // points to a User that no longer exists (a "dangling reference").
        //
        // We will REMOVE the .populate() call entirely.
        // The frontend (dashboard.html) is safe and will display "N/A".
        
        const tests = await Test.find({ 
                isActive: true,
                createdBy: { $ne: null } // Keep this check just in case
            })
            .select('title createdBy'); // Just select the fields
            // .populate({ path: 'createdBy', select: 'username' });  <-- THIS LINE IS REMOVED
        // --- END NEW FIX #2 ---

        res.json({ success: true, tests });
    } catch (error) {
        console.error("Error fetching active tests:", error);
        res.status(500).json({ message: 'Server error fetching active tests' });
    }
});
// --- END NEW ROUTE ---


// POST /api/test/start/:testId
// User starts a test, provides password
router.post('/start/:testId', auth, async (req, res) => {
    try {
        const { testId } = req.params;
        const { password } = req.body;
        const userId = req.user.id;

        if (!password) {
            return res.status(400).json({ message: 'Password is required' });
        }
        
        // Find the test and select the password
        const test = await Test.findById(testId).select('+password');
        if (!test) {
            return res.status(404).json({ message: 'Test not found' });
        }
        
        // --- ADD CHECK FOR isActive ---
        if (!test.isActive) {
            return res.status(403).json({ message: 'This test is not currently active.' });
        }
        // --- END ADDED CHECK ---

        // Check password
        const isMatch = await test.correctPassword(password);
        if (!isMatch) {
            return res.status(403).json({ message: 'Invalid test password' });
        }

        // Get or create the user's attempt record
        const { user, attempt } = await getOrCreateAttempt(userId, testId);

        // Check if user is locked
        if (attempt.status === 'locked') {
            return res.status(403).json({ 
                message: 'Your test is locked due to violations. Please contact your mentor.',
                status: 'locked'
            });
        }
        
        // Load all questions for the test
        await test.populate('questions');
        
        // TODO: Add logic to find which question the user is currently on
        // For now, we'll just send the first question
        const firstQuestion = test.questions[0];
        
        if (!firstQuestion) {
             return res.status(404).json({ message: 'This test has no questions.' });
        }

        res.json({
            success: true,
            message: 'Test started.',
            testTitle: test.title,
            attemptId: attempt._id,
            strikes: attempt.strikes,
            currentQuestion: firstQuestion, // Send first question
            totalQuestions: test.questions.length // <-- Send total question count
        });

    } catch (error) {
        console.error("Error starting test:", error);
        res.status(500).json({ message: error.message || 'Server error starting test' });
    }
});

// POST /api/test/violation
// Logs a proctoring violation (tab switch, fullscreen exit)
router.post('/violation', auth, async (req, res) => {
    try {
        const { attemptId } = req.body;
        const userId = req.user.id;
        
        const user = await User.findOne({ _id: userId, 'testAttempts._id': attemptId });
        if (!user) {
            return res.status(404).json({ message: 'Test attempt not found' });
        }
        
        const attempt = user.testAttempts.id(attemptId);
        if (attempt.status !== 'inprogress') {
            return res.status(400).json({ message: `Test is not in progress (status: ${attempt.status})` });
        }

        attempt.strikes += 1;
        
        let newStatus = attempt.status;
        let message = `Violation #${attempt.strikes} logged.`;

        if (attempt.strikes >= 3) {
            attempt.status = 'locked';
            newStatus = 'locked';
            message = '3-strike limit reached. Test has been locked.';
        }
        
        await user.save();
        
        console.log(`[Violation] User: ${userId}, Attempt: ${attemptId}, Strikes: ${attempt.strikes}, Status: ${attempt.status}`);

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
// User submits an answer for a question
router.post('/submit', auth, async (req, res) => {
     try {
        const { attemptId, questionId, answer } = req.body; // answer is index (0-3) or string
        const userId = req.user.id;

        const user = await User.findOne({ _id: userId, 'testAttempts._id': attemptId });
        if (!user) return res.status(404).json({ message: 'Test attempt not found' });
        
        const attempt = user.testAttempts.id(attemptId);
        if (attempt.status !== 'inprogress') {
            return res.status(403).json({ message: 'Test is locked or completed.' });
        }

        const question = await Question.findById(questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });

        // --- Check Answer ---
        let isCorrect = false;
        if (question.questionType === 'mcq') {
            isCorrect = (parseInt(answer, 10) === question.correctAnswerIndex);
        } else if (question.questionType === 'short_answer') {
            // Case-insensitive, whitespace-trimmed check
            const userAns = (answer || '').trim().toLowerCase();
            isCorrect = question.shortAnswers.some(sa => sa.trim().toLowerCase() === userAns);
        }
        
        if (isCorrect) {
            // TODO: Add points based on question value
            attempt.score += 10; // Simple 10 points for now
        }
        
        // TODO: Save question answer history in the attempt
        // attempt.answers.push({ questionId, answer, isCorrect });

        await user.save();
        
        // --- Find Next Question ---
        const test = await Test.findById(attempt.testId).populate('questions');
        const currentQuestionIndex = test.questions.findIndex(q => q._id.toString() === questionId);
        
        let nextQuestion = null;
        if (currentQuestionIndex !== -1 && currentQuestionIndex < test.questions.length - 1) {
            nextQuestion = test.questions[currentQuestionIndex + 1];
        }

        if (!nextQuestion) {
            // This was the last question
            attempt.status = 'completed';
            attempt.completedAt = new Date();
            await user.save();
            
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
