// functions/routes/mentor.js

const express = require('express');
const mentorAuth = require('../middleware/mentorAuth');
const UserService = require('../models/User'); // <-- Use UserService
// 🚨 TEMPORARY: These models are still Mongoose/will be converted later
const Test = require('../models/Test'); 
const Question = require('../models/Question');
const DailyProblemService = require('../models/DailyProblem'); // <-- Use DailyProblemService
const DoubtThread = require('../models/DoubtThread'); 
const DoubtMessage = require('../models/DoubtMessage'); 
const { checkSubjectAccess } = require('../utils/accessControl'); 

const router = express.Router();

// --- Test Management ---

// GET: Fetch all tests created by the logged-in mentor
router.get('/tests', mentorAuth, async (req, res) => {
    try {
        // NOTE: Test model is still Mongoose for now.
        const tests = await Test.find({ createdBy: req.user.id })
            .populate('questions', 'text timeLimit')
            .sort({ createdAt: -1 });
            
        res.json({ success: true, tests });
    } catch (error) {
        console.error("Error fetching mentor's tests:", error);
        res.status(500).json({ message: "Error fetching tests" });
    }
});

// POST: Create a new test
router.post('/tests', mentorAuth, async (req, res) => {
    try {
        const { title, password } = req.body;
        if (!title || !password) {
            return res.status(400).json({ message: 'Title and password are required' });
        }

        // NOTE: Test model is still Mongoose for now.
        const newTest = new Test({
            title,
            password,
            createdBy: req.user.id
        });
        
        await newTest.save();
        res.status(201).json({ success: true, message: 'Test created successfully', test: newTest });
    } catch (error) {
        console.error("Error creating test:", error);
        res.status(500).json({ message: 'Error creating test' });
    }
});

// DELETE: Delete a test and all associated data
router.delete('/tests/:testId', mentorAuth, async (req, res) => {
    try {
        const { testId } = req.params;

        // 1. Find the test and ensure the mentor owns it
        // NOTE: Test model is still Mongoose for now.
        const test = await Test.findOne({ _id: testId, createdBy: req.user.id });
        if (!test) {
            return res.status(404).json({ message: 'Test not found or you do not own this test' });
        }

        const questionIds = test.questions;

        // 2. Delete the Test itself (Mongoose)
        await Test.deleteOne({ _id: test._id });

        // 3. Delete all associated Questions (Mongoose)
        if (questionIds && questionIds.length > 0) {
            await Question.deleteMany({ _id: { $in: questionIds } });
        }

        // 4. Pull all associated testAttempts from all users (Mongoose)
        // NOTE: This relies on Mongoose updateMany for now, which is a known breakage point.
        await UserService.updateMany( 
             { 'testAttempts.testId': testId },
             { $pull: { testAttempts: { testId: testId } } }
        ); 
        
        console.log(`[Test Delete] Mentor ${req.user.id} deleted test ${testId}. Associated questions and attempts removed.`);
        res.json({ success: true, message: `Test "${test.title}" deleted successfully.` });

    } catch (error) {
        console.error("Error deleting test:", error);
        res.status(500).json({ message: 'Error deleting test' });
    }
});

// POST: Add a new question
router.post('/tests/:testId/questions', mentorAuth, async (req, res) => {
    try {
        const { testId } = req.params;
        // NOTE: Test/Question are Mongoose for now
        const test = await Test.findOne({ _id: testId, createdBy: req.user.id });
        if (!test) return res.status(404).json({ message: 'Test not found or you do not own this test' });
        
        const newQuestion = new Question(req.body);
        newQuestion.createdBy = req.user.id;
        await newQuestion.save(); 
        
        test.questions.push(newQuestion._id);
        await test.save();
        
        const populatedQuestion = {
             _id: newQuestion._id,
             text: newQuestion.text,
             timeLimit: newQuestion.timeLimit
        };

        res.status(201).json({ 
            success: true, 
            message: 'Question added to test', 
            question: populatedQuestion 
        });

    } catch (error) {
        console.error("Error adding question:", error);
         if (error.name === 'ValidationError') {
             return res.status(400).json({ message: `Validation Error: ${error.message}` });
         }
        res.status(500).json({ message: 'Error adding question' });
    }
});

// GET: GET a single question's full details for editing
router.get('/questions/:questionId', mentorAuth, async (req, res) => {
    try {
        // NOTE: Question is Mongoose for now
        const question = await Question.findOne({
            _id: req.params.questionId,
            createdBy: req.user.id
        });

        if (!question) {
            return res.status(404).json({ message: 'Question not found or access denied' });
        }
        
        res.json({ success: true, question });

    } catch (error) {
        console.error("Error fetching question details:", error);
        res.status(500).json({ message: 'Error fetching question details' });
    }
});

// UPDATE a single question
router.put('/questions/:questionId', mentorAuth, async (req, res) => {
    try {
        const { questionId } = req.params;
        
        // NOTE: Question is Mongoose for now
        const question = await Question.findOne({
            _id: questionId,
            createdBy: req.user.id
        });

        if (!question) {
            return res.status(404).json({ message: 'Question not found or access denied' });
        }
        
        // Update fields directly on the Mongoose document
        Object.assign(question, req.body);

        // The pre-save hook in Question.js will run and validate
        await question.save(); 
        
        const populatedQuestion = {
             _id: question._id,
             text: question.text,
             timeLimit: question.timeLimit
        };

        res.json({ 
            success: true, 
            message: 'Question updated successfully',
            question: populatedQuestion 
        });

    } catch (error) {
        console.error("Error updating question:", error);
         if (error.name === 'ValidationError') {
             return res.status(400).json({ message: `Validation Error: ${error.message}` });
         }
        res.status(500).json({ message: 'Error updating question' });
    }
});

// DELETE a single question
router.delete('/tests/:testId/questions/:questionId', mentorAuth, async (req, res) => {
    try {
        const { testId, questionId } = req.params;

        // 1. Find the question and ensure ownership (Mongoose)
        const question = await Question.findOne({
            _id: questionId,
            createdBy: req.user.id
        });
        if (!question) {
             return res.status(404).json({ message: 'Question not found or access denied' });
        }

        // 2. Find the test and ensure ownership (Mongoose)
        const test = await Test.findOne({
            _id: testId,
            createdBy: req.user.id
        });
        if (!test) {
            return res.status(404).json({ message: 'Test not found or access denied' });
        }

        // 3. Delete the question from the Question collection (Mongoose)
        await Question.deleteOne({ _id: questionId });
        
        // 4. Pull the question's ID from the test's 'questions' array (Mongoose)
        await Test.updateOne(
            { _id: testId },
            { $pull: { questions: questionId } }
        );

        res.json({ success: true, message: 'Question deleted successfully' });

    } catch (error) {
        console.error("Error deleting question:", error);
        res.status(500).json({ message: 'Error deleting question' });
    }
});


// POST: Toggle a test's active status
router.post('/tests/:testId/toggle', mentorAuth, async (req, res) => {
    try {
        // NOTE: Test model is still Mongoose for now.
        const { testId } = req.params;

        const test = await Test.findOne({ _id: testId, createdBy: req.user.id });
        if (!test) return res.status(404).json({ message: 'Test not found or you do not own this test' });
        
        test.isActive = !test.isActive;
        await test.save();
        
        const message = test.isActive ? `Test "${test.title}" is now Active.` : `Test "${test.title}" is now a Draft.`;
        
        res.json({ success: true, message: message, test: test });

    } catch (error) {
        console.error("Error toggling test status:", error);
         if (error.name === 'ValidationError') {
             return res.status(400).json({ message: `Validation Error: ${error.message}` });
         }
        res.status(500).json({ message: 'Error toggling test status' });
    }
});

// --- User Monitoring & Control ---

// GET: Get all user attempts for a specific test (for monitoring)
router.get('/tests/:testId/attempts', mentorAuth, async (req, res) => {
     try {
        const { testId } = req.params;
        
        // NOTE: Test model is still Mongoose for now.
        const test = await Test.findOne({ _id: testId, createdBy: req.user.id });
        if (!test) return res.status(404).json({ message: 'Test not found or you do not own this test' });
        
        // CHANGE: Use UserService.find to retrieve users
        const usersWithAttempts = await UserService.find({ 'testAttempts.testId': testId });
            
        // Filter attempts to only return info for the relevant test
        const attempts = usersWithAttempts.map(user => {
            // Find attempt by matching Firestore ID (string)
            const attempt = (user.testAttempts || []).find(a => a.testId === testId);
            if (!attempt) return null;
            
            return {
                userId: user.id,
                username: user.username,
                avatar: user.profile.avatar,
                attemptId: attempt._id, // The ID of the subdocument (still Mongoose ObjectId for now)
                status: attempt.status,
                strikes: attempt.strikes,
                score: attempt.score,
                startedAt: attempt.startedAt
            };
        }).filter(Boolean);
            
        res.json({ success: true, attempts });
        
    } catch (error) {
        console.error("Error fetching test attempts:", error);
        res.status(500).json({ message: 'Error fetching attempts' });
    }
});

// POST: Unlock a user's test attempt (3-strike reset)
router.post('/attempts/unlock', mentorAuth, async (req, res) => {
    try {
        const { userId, attemptId } = req.body;
        
        if (!userId || !attemptId) {
            return res.status(400).json({ message: 'userId and attemptId are required' });
        }
        
        // CHANGE: Use UserService.findById
        let user = await UserService.findById(userId);
        
        if (!user) return res.status(404).json({ message: 'User or test attempt not found' });
        
        // Find the specific attempt by ID (complex: iterating array/matching ID)
        const attempt = user.testAttempts.find(a => a._id === attemptId);
        if (!attempt) {
             return res.status(404).json({ message: 'Test attempt subdocument not found' });
        }

        // Check if mentor owns the test this attempt belongs to (Mongoose)
        const test = await Test.findOne({ _id: attempt.testId, createdBy: req.user.id });
        if (!test) {
             return res.status(403).json({ message: 'Access denied: You do not own the test associated with this attempt.' });
        }
        
        if (attempt.status === 'locked') {
            attempt.status = 'inprogress';
            attempt.strikes = 0; 
            await UserService.update(user.id, user); // CHANGE: Save user changes
            res.json({ success: true, message: `Test unlocked for ${user.username}` });
        } else {
            res.status(400).json({ success: false, message: `Test is not locked (status: ${attempt.status})` });
        }
        
    } catch (error) {
         console.error("Error unlocking test:", error);
         res.status(500).json({ message: 'Error unlocking test' });
    }
});

// --- Daily Problem Management ---

router.post('/daily-problem', mentorAuth, async (req, res) => {
    try {
        // CHANGE: Use DailyProblemService.create
        const newProblem = await DailyProblemService.create({
            ...req.body,
            createdBy: req.user.id
        });

        res.status(201).json({ success: true, message: 'Daily Problem created successfully.', problem: newProblem });
    } catch (error) {
        console.error("Error creating daily problem:", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: `Validation Error: ${error.message}` });
        }
        res.status(500).json({ message: 'Error creating daily problem' });
    }
});

// GET: Fetch all daily problems created by this mentor
router.get('/daily-problems', mentorAuth, async (req, res) => {
    try {
        // CHANGE: Use DailyProblemService.find
        const problems = await DailyProblemService.find({ createdBy: req.user.id });
        res.json({ success: true, problems });
    } catch (error) {
        console.error("Error fetching mentor's daily problems:", error);
        res.status(500).json({ message: "Error fetching daily problems" });
    }
});

// POST: Activate a daily problem
router.post('/daily-problem/:problemId/activate', mentorAuth, async (req, res) => {
    try {
        const { problemId } = req.params;
        // CHANGE: Use DailyProblemService.findById
        const problem = await DailyProblemService.findById(problemId);

        if (!problem || problem.createdBy !== req.user.id) {
            return res.status(404).json({ message: 'Problem not found or access denied.' });
        }

        // 1. Deactivate all other problems for this subject (Using custom updateMany)
        await DailyProblemService.updateMany(
            { subject: problem.subject, _id: { $ne: problem._id } },
            { $set: { isActive: false } }
        );

        // 2. Activate this problem (using the service object's save method)
        problem.isActive = true;
        await problem.save();
        
        res.json({ success: true, message: `Problem "${problem.title}" is now active for ${problem.subject}.` });
    } catch (error) {
        console.error("Error activating daily problem:", error);
        res.status(500).json({ message: 'Error activating problem' });
    }
});

// --- Submission Review ---

// GET: Get all user submissions that need review
router.get('/submissions-for-review', mentorAuth, async (req, res) => {
    try {
        // CHANGE: Use UserService.find and DailyProblemService.find
        const allUsers = await UserService.find(); 
        const problems = await DailyProblemService.find();
        const problemMap = new Map(problems.map(p => [p._id, p]));

        const submissionsForReview = [];

        allUsers.forEach(user => {
            (user.dailyProblemAttempts || []).forEach(attempt => {
                const problem = problemMap.get(attempt.problemId);
                
                if (problem && attempt.isLocked && !attempt.passed && !attempt.mentorFeedback) {
                    submissionsForReview.push({
                        userId: user.id,
                        username: user.username,
                        problemId: problem._id,
                        problemTitle: problem.title,
                        problemSubject: problem.subject,
                        lastSubmittedCode: attempt.lastSubmittedCode,
                        lastResults: attempt.lastResults,
                        submittedAt: attempt.lastAttemptedAt || attempt.updatedAt
                    });
                }
            });
        });
        
        submissionsForReview.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

        res.json({ success: true, submissions: submissionsForReview });
    } catch (error) {
        console.error("Error fetching submissions for review:", error);
        res.status(500).json({ message: 'Error fetching submissions' });
    }
});

// POST: Submit feedback for a submission
router.post('/feedback', mentorAuth, async (req, res) => {
    try {
        const { userId, problemId, feedbackText } = req.body;
        if (!userId || !problemId || !feedbackText) {
            return res.status(400).json({ message: 'userId, problemId, and feedbackText are required.' });
        }

        // CHANGE: Use UserService.findById
        let user = await UserService.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // CHANGE: Use user.findOrCreateDailyAttempt 
        const attempt = user.findOrCreateDailyAttempt(problemId);
        if (!attempt) return res.status(404).json({ message: 'Submission attempt not found.' });
        
        attempt.mentorFeedback = feedbackText;
        attempt.feedbackRead = false; 
        
        await UserService.update(user.id, user); 
        
        res.json({ success: true, message: 'Feedback submitted successfully.' });
    } catch (error) {
        console.error("Error submitting feedback:", error);
        res.status(500).json({ message: 'Error submitting feedback' });
    }
});

// --- Doubt Management (Still Mongoose for now) ---
// NOTE: These routes will be converted in the final model cleanup steps.
router.get('/doubts/queue', mentorAuth, async (req, res) => {
    try {
        const newDoubts = await DoubtThreadService.find({ status: 'new' }, { field: 'createdAt', direction: 'asc' });

        // Manually populate userId (sender) for the list display
        const populatedDoubts = await Promise.all(newDoubts.map(async (thread) => {
             const user = await UserService.findById(thread.userId);
             return { ...thread, userId: { username: user?.username || 'Deleted User' } };
        }));

        res.json({ success: true, doubts: populatedDoubts });
    } catch (error) {
        console.error("Error fetching new doubts queue:", error);
        res.status(500).json({ message: "Error fetching new doubts" });
    }
});

// GET: Fetch mentor's active, claimed doubts
router.get('/doubts/active', mentorAuth, async (req, res) => {
    try {
        const myDoubts = await DoubtThreadService.find({
            mentorId: req.user.id,
            status: 'in-progress'
        });

        // Manually populate userId (sender) for the list display
        const populatedDoubts = await Promise.all(myDoubts.map(async (thread) => {
             const user = await UserService.findById(thread.userId);
             return { ...thread, userId: { username: user?.username || 'Deleted User' } };
        }));

        res.json({ success: true, doubts: populatedDoubts });
    } catch (error) {
        console.error("Error fetching mentor's active doubts:", error);
        res.status(500).json({ message: "Error fetching active doubts" });
    }
});

// POST: Mentor claims a doubt from the queue
router.post('/doubts/claim/:threadId', mentorAuth, async (req, res) => {
    try {
        const { threadId } = req.params;
        const mentorId = req.user.id;
        
        const thread = await DoubtThread.findById(threadId);

        if (!thread) return res.status(404).json({ message: 'Doubt thread not found.' });
        if (thread.status !== 'new') return res.status(400).json({ message: 'This doubt has already been claimed.' });

        thread.status = 'in-progress';
        thread.mentorId = mentorId;
        await thread.save();

        res.json({ success: true, message: 'Doubt claimed successfully.', thread });

    } catch (error) {
        console.error("Error claiming doubt:", error);
        res.status(500).json({ message: "Error claiming doubt" });
    }
});

// GET: Mentor gets all messages for a thread
router.get('/doubts/thread/:threadId', mentorAuth, async (req, res) => {
    try {
        const { threadId } = req.params;
        const mentorId = req.user.id;

        const thread = await DoubtThread.findOne({
             _id: threadId,
             $or: [ { mentorId: mentorId }, { status: 'new' } ]
        });
        
        if (!thread) return res.status(404).json({ message: 'Doubt thread not found or access denied.' });

        const messages = await DoubtMessage.find({ threadId: threadId })
            .populate('senderId', 'username profile.avatar')
            .sort({ createdAt: 1 });
        res.json({ success: true, thread, messages });

    } catch (error) {
        console.error('Error fetching mentor thread messages:', error);
        res.status(500).json({ message: 'Server error fetching messages.' });
    }
});

// POST: Mentor sends a reply to a thread
router.post('/doubts/thread/:threadId/reply', mentorAuth, async (req, res) => {
    try {
        const { threadId } = req.params;
        const { message } = req.body;
        const mentorId = req.user.id;

        if (!message) return res.status(400).json({ message: 'Message content is required.' });

        const thread = await DoubtThread.findOne({ _id: threadId, mentorId: mentorId });
        if (!thread) return res.status(404).json({ message: 'Doubt thread not found or not assigned to you.' });
        if (thread.status === 'resolved') return res.status(400).json({ message: 'This thread is already resolved.' });

        thread.updatedAt = new Date();
        await thread.save();

        const newMessage = new DoubtMessage({
            threadId: thread._id,
            senderId: mentorId,
            senderRole: 'mentor',
            message: message
        });
        await newMessage.save();
        
        const populatedMessage = await DoubtMessage.findById(newMessage._id)
            .populate('senderId', 'username profile.avatar')

        res.status(201).json({ success: true, message: 'Reply sent.', newMessage: populatedMessage });

    } catch (error) {
        console.error('Error sending mentor reply:', error);
        res.status(500).json({ message: 'Server error sending reply.' });
    }
});

// POST: Mentor resolves a thread
router.post('/doubts/thread/:threadId/resolve', mentorAuth, async (req, res) => {
    try {
        const { threadId } = req.params;
        const mentorId = req.user.id;

        const resolutionTime = new Date();

        const thread = await DoubtThread.findOneAndUpdate(
            { _id: threadId, mentorId: mentorId }, 
            { $set: { status: 'resolved', resolvedAt: resolutionTime } },
            { new: true }
        );

        if (!thread) return res.status(404).json({ message: 'Doubt thread not found or not assigned to you.' });

        await DoubtMessage.updateMany(
            { threadId: thread._id },
            { $set: { resolvedAt: resolutionTime } }
        );

        res.json({ success: true, message: 'Thread marked as resolved. It will be deleted in 24 hours.', thread });

    } catch (error) {
        console.error('Error resolving thread by mentor:', error);
        res.status(500).json({ message: 'Server error resolving thread.' });
    }
});

module.exports = router;