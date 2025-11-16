// backend/routes/mentor.js
const express = require('express');
const mentorAuth = require('../middleware/mentorAuth');
const User = require('../models/User'); // <-- MOVED UP
const Test = require('../models/Test');
const Question = require('../models/Question');
const mongoose = require('mongoose');
const DailyProblem = require('../models/DailyProblem');
const DoubtThread = require('../models/DoubtThread'); 
const DoubtMessage = require('../models/DoubtMessage'); 
const { checkSubjectAccess } = require('../utils/accessControl'); 

const router = express.Router();

// --- Test Management ---

// GET: Fetch all tests created by the logged-in mentor
router.get('/tests', mentorAuth, async (req, res) => {
    try {
        const tests = await Test.find({ createdBy: req.user.id })
            .populate('questions', 'text timeLimit') // Populates text/timeLimit for the list
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
        const test = await Test.findOne({ _id: testId, createdBy: req.user.id });
        if (!test) {
            return res.status(404).json({ message: 'Test not found or you do not own this test' });
        }

        const questionIds = test.questions;

        // 2. Delete the Test itself
        await Test.deleteOne({ _id: test._id });

        // 3. Delete all associated Questions
        if (questionIds && questionIds.length > 0) {
            await Question.deleteMany({ _id: { $in: questionIds } });
        }

        // 4. Pull all associated testAttempts from all users
        await User.updateMany(
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

// POST: Add a new question (MCQ or Short Answer) and link it to a test
router.post('/tests/:testId/questions', mentorAuth, async (req, res) => {
    try {
        const { testId } = req.params;
        const {
            text,
            questionType, // 'mcq' or 'short_answer'
            options,
            correctAnswerIndex,
            shortAnswers,
            timeLimit 
        } = req.body;

        // Find the test and check if mentor owns it
        const test = await Test.findOne({ _id: testId, createdBy: req.user.id });
        if (!test) {
            return res.status(404).json({ message: 'Test not found or you do not own this test' });
        }
        
        // Prepare data for the new question model
        const questionData = {
            text,
            questionType,
            timeLimit,
            createdBy: req.user.id,
            options: (questionType === 'mcq') ? options : undefined,
            correctAnswerIndex: (questionType === 'mcq') ? correctAnswerIndex : undefined,
            shortAnswers: (questionType === 'short_answer') ? shortAnswers : undefined
        };

        // Create new question
        // The pre-save hook in Question.js will handle validation
        const newQuestion = new Question(questionData);
        await newQuestion.save(); // This will trigger the validation hook
        
        // Add question to test
        test.questions.push(newQuestion._id);
        await test.save();
        
        // --- MODIFICATION: Return the fully populated question ---
        // We do this so the frontend can immediately add it to the list
        const populatedQuestion = {
             _id: newQuestion._id,
             text: newQuestion.text,
             timeLimit: newQuestion.timeLimit
        };

        res.status(201).json({ 
            success: true, 
            message: 'Question added to test', 
            question: populatedQuestion // Send back the populated question
        });

    } catch (error) {
        console.error("Error adding question:", error);
         if (error.name === 'ValidationError') {
             // Send validation errors from the model's pre-save hook
             return res.status(400).json({ message: `Validation Error: ${error.message}` });
         }
        res.status(500).json({ message: 'Error adding question' });
    }
});

// --- NEW ROUTE: GET a single question's full details for editing ---
router.get('/questions/:questionId', mentorAuth, async (req, res) => {
    try {
        const { questionId } = req.params;
        
        const question = await Question.findOne({
            _id: questionId,
            createdBy: req.user.id // Ensure mentor owns this question
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

// --- NEW ROUTE: UPDATE a single question ---
router.put('/questions/:questionId', mentorAuth, async (req, res) => {
    try {
        const { questionId } = req.params;
        const {
            text,
            questionType,
            options,
            correctAnswerIndex,
            shortAnswers,
            timeLimit 
        } = req.body;

        // Find the question and check ownership
        const question = await Question.findOne({
            _id: questionId,
            createdBy: req.user.id
        });

        if (!question) {
            return res.status(404).json({ message: 'Question not found or access denied' });
        }
        
        // Update fields
        question.text = text;
        question.questionType = questionType;
        question.timeLimit = timeLimit;

        if (questionType === 'mcq') {
            question.options = options;
            question.correctAnswerIndex = correctAnswerIndex;
            question.shortAnswers = undefined;
        } else if (questionType === 'short_answer') {
            question.shortAnswers = shortAnswers;
            question.options = undefined;
            question.correctAnswerIndex = undefined;
        }

        // The pre-save hook in Question.js will run and validate
        await question.save(); 
        
        // --- MODIFICATION: Return the updated, populated question text/time ---
        const populatedQuestion = {
             _id: question._id,
             text: question.text,
             timeLimit: question.timeLimit
        };

        res.json({ 
            success: true, 
            message: 'Question updated successfully',
            question: populatedQuestion // Send back updated data for the list
        });

    } catch (error) {
        console.error("Error updating question:", error);
         if (error.name === 'ValidationError') {
             return res.status(400).json({ message: `Validation Error: ${error.message}` });
         }
        res.status(500).json({ message: 'Error updating question' });
    }
});

// --- NEW ROUTE: DELETE a single question (from Test and Question collection) ---
router.delete('/tests/:testId/questions/:questionId', mentorAuth, async (req, res) => {
    try {
        const { testId, questionId } = req.params;

        // 1. Find the question and check ownership
        const question = await Question.findOne({
            _id: questionId,
            createdBy: req.user.id
        });
        if (!question) {
             return res.status(404).json({ message: 'Question not found or access denied' });
        }

        // 2. Find the test and check ownership
        const test = await Test.findOne({
            _id: testId,
            createdBy: req.user.id
        });
        if (!test) {
            return res.status(404).json({ message: 'Test not found or access denied' });
        }

        // 3. Delete the question from the Question collection
        await Question.deleteOne({ _id: questionId });
        
        // 4. Pull the question's ID from the test's 'questions' array
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
        const { testId } = req.params;

        // Find the test and check if mentor owns it
        const test = await Test.findOne({ _id: testId, createdBy: req.user.id });
        if (!test) {
            return res.status(404).json({ message: 'Test not found or you do not own this test' });
        }
        
        // Flip the active status
        test.isActive = !test.isActive;
        await test.save();
        
        const message = test.isActive ? `Test "${test.title}" is now Active.` : `Test "${test.title}" is now a Draft.`;
        console.log(`[Test Toggle] Mentor ${req.user.id} set test ${testId} to ${test.isActive}`);
        
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
        
        // Ensure mentor owns this test
        const test = await Test.findOne({ _id: testId, createdBy: req.user.id });
        if (!test) {
            return res.status(404).json({ message: 'Test not found or you do not own this test' });
        }
        
        // Find users who have an attempt for this test
        const usersWithAttempts = await User.find({ 'testAttempts.testId': testId })
            .select('username profile.avatar testAttempts');
            
        // Filter attempts to only return info for the relevant test
        const attempts = usersWithAttempts.map(user => {
            const attempt = user.testAttempts.find(a => a.testId.toString() === testId);
            return {
                userId: user._id,
                username: user.username,
                avatar: user.profile.avatar,
                attemptId: attempt._id, // The ID of the subdocument
                status: attempt.status,
                strikes: attempt.strikes,
                score: attempt.score,
                startedAt: attempt.startedAt
            };
        }).filter(Boolean); // Filter out any nulls
            
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
        
        // Find the user and the specific test attempt
        const user = await User.findOne({ _id: userId, 'testAttempts._id': attemptId });
        
        if (!user) {
            return res.status(404).json({ message: 'User or test attempt not found' });
        }
        
        // Find the specific attempt
        const attempt = user.testAttempts.id(attemptId);
        if (!attempt) {
             return res.status(404).json({ message: 'Test attempt subdocument not found' });
        }

        // Check if mentor owns the test this attempt belongs to
        const test = await Test.findOne({ _id: attempt.testId, createdBy: req.user.id });
        if (!test) {
             return res.status(403).json({ message: 'Access denied: You do not own the test associated with this attempt.' });
        }
        
        // Only unlock if it's currently locked
        if (attempt.status === 'locked') {
            attempt.status = 'inprogress';
            attempt.strikes = 0; // Reset strikes
            await user.save();
            res.json({ success: true, message: `Test unlocked for ${user.username}` });
        } else {
            res.status(400).json({ success: false, message: `Test is not locked (status: ${attempt.status})` });
        }
        
    } catch (error) {
         console.error("Error unlocking test:", error);
         res.status(500).json({ message: 'Error unlocking test' });
    }
});

router.post('/daily-problem', mentorAuth, async (req, res) => {
    try {
        const { 
            subject, title, description, boilerplateCode, 
            solutionCode, testCases, pointsForAttempt, language
        } = req.body;

        if (!subject || !title || !description || !solutionCode || !testCases || !language) {
            return res.status(400).json({ message: 'Missing required fields for daily problem.' });
        }
        
        const newProblem = new DailyProblem({
            subject, title, description, boilerplateCode, 
            solutionCode, testCases, pointsForAttempt, language,
            createdBy: req.user.id,
            isActive: false // Always created as draft
        });

        await newProblem.save();
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
        const problems = await DailyProblem.find({ createdBy: req.user.id })
            .sort({ subject: 1, createdAt: -1 });
        res.json({ success: true, problems });
    } catch (error) {
        console.error("Error fetching mentor's daily problems:", error);
        res.status(500).json({ message: "Error fetching daily problems" });
    }
});

// POST: Activate a daily problem (and deactivate others for that subject)
router.post('/daily-problem/:problemId/activate', mentorAuth, async (req, res) => {
    try {
        const { problemId } = req.params;
        const problem = await DailyProblem.findOne({ _id: problemId, createdBy: req.user.id });

        if (!problem) {
            return res.status(404).json({ message: 'Problem not found or access denied.' });
        }

        // 1. Deactivate all other problems for this subject
        await DailyProblem.updateMany(
            { subject: problem.subject, _id: { $ne: problem._id } },
            { $set: { isActive: false } }
        );

        // 2. Activate this problem
        problem.isActive = true;
        await problem.save();
        
        res.json({ success: true, message: `Problem "${problem.title}" is now active for ${problem.subject}.` });
    } catch (error) {
        console.error("Error activating daily problem:", error);
        res.status(500).json({ message: 'Error activating problem' });
    }
});

// GET: Get all user submissions that need review
// (Locked, Failed, No Feedback Yet)
router.get('/submissions-for-review', mentorAuth, async (req, res) => {
    try {
        // Find users who have at least one attempt matching the criteria
        const usersWithSubmissions = await User.find({
            'dailyProblemAttempts.isLocked': true,
            'dailyProblemAttempts.passed': false,
            'dailyProblemAttempts.mentorFeedback': null
        })
        .populate('dailyProblemAttempts.problemId', 'title subject') // Populate problem title/subject
        .select('username dailyProblemAttempts'); // Select only username and attempts

        if (!usersWithSubmissions) {
            return res.json({ success: true, submissions: [] });
        }

        // Filter out the specific submissions that need review
        const submissionsForReview = [];
        usersWithSubmissions.forEach(user => {
            user.dailyProblemAttempts.forEach(attempt => {
                // Check if problemId is populated before accessing it
                if (attempt.isLocked && !attempt.passed && !attempt.mentorFeedback && attempt.problemId) {
                    submissionsForReview.push({
                        userId: user._id,
                        username: user.username,
                        problemId: attempt.problemId._id,
                        problemTitle: attempt.problemId.title,
                        problemSubject: attempt.problemId.subject,
                        lastSubmittedCode: attempt.lastSubmittedCode,
                        lastResults: attempt.lastResults,
                        submittedAt: attempt.lastAttemptedAt || attempt.updatedAt
                    });
                }
            });
        });
        
        // Sort by most recent
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

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Use the instance method we created
        const attempt = user.findOrCreateDailyAttempt(problemId);
        if (!attempt) {
             // This should theoretically not happen due to findOrCreate
            return res.status(404).json({ message: 'Submission attempt not found.' });
        }
        
        attempt.mentorFeedback = feedbackText;
        attempt.feedbackRead = false; // Mark as unread
        user.markModified('dailyProblemAttempts'); // Mark the array as modified
        
        await user.save();
        
        res.json({ success: true, message: 'Feedback submitted successfully.' });
    } catch (error) {
        console.error("Error submitting feedback:", error);
        res.status(500).json({ message: 'Error submitting feedback' });
    }
});

// --- Doubt Management ---

// GET: Fetch new, unclaimed doubts for the queue
router.get('/doubts/queue', mentorAuth, async (req, res) => {
    try {
        const newDoubts = await DoubtThread.find({ status: 'new' })
            .populate('userId', 'username')
            .sort({ createdAt: 1 }); // Oldest first
        res.json({ success: true, doubts: newDoubts });
    } catch (error) {
        console.error("Error fetching new doubts queue:", error);
        res.status(500).json({ message: "Error fetching new doubts" });
    }
});

// GET: Fetch mentor's active, claimed doubts
router.get('/doubts/active', mentorAuth, async (req, res) => {
    try {
        const myDoubts = await DoubtThread.find({
            mentorId: req.user.id,
            status: 'in-progress'
        })
        .populate('userId', 'username')
        .sort({ updatedAt: -1 }); // Most recently active first

        res.json({ success: true, doubts: myDoubts });
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

        if (!thread) {
            return res.status(404).json({ message: 'Doubt thread not found.' });
        }
        if (thread.status !== 'new') {
            return res.status(400).json({ message: 'This doubt has already been claimed.' });
        }

        thread.status = 'in-progress';
        thread.mentorId = mentorId;
        await thread.save();

        res.json({ success: true, message: 'Doubt claimed successfully.', thread });

    } catch (error) {
        console.error("Error claiming doubt:", error);
        res.status(500).json({ message: "Error claiming doubt" });
    }
});

// GET: Mentor gets all messages for a thread (must be their thread)
router.get('/doubts/thread/:threadId', mentorAuth, async (req, res) => {
    try {
        const { threadId } = req.params;
        const mentorId = req.user.id;

        // Find thread, ensure it's either assigned to this mentor or is new (admin/mentor might check)
        const thread = await DoubtThread.findOne({
             _id: threadId,
             $or: [ { mentorId: mentorId }, { status: 'new' } ]
        });
        
        if (!thread) {
            return res.status(404).json({ message: 'Doubt thread not found or access denied.' });
        }

        // Fetch all messages
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

        if (!message) {
            return res.status(400).json({ message: 'Message content is required.' });
        }

        // Verify this thread is assigned to this mentor
        const thread = await DoubtThread.findOne({ _id: threadId, mentorId: mentorId });
        if (!thread) {
            return res.status(404).json({ message: 'Doubt thread not found or not assigned to you.' });
        }
        if (thread.status === 'resolved') {
             return res.status(400).json({ message: 'This thread is already resolved.' });
        }

        // Mark the thread as updated
        thread.updatedAt = new Date();
        await thread.save();

        // Create the new message
        const newMessage = new DoubtMessage({
            threadId: thread._id,
            senderId: mentorId,
            senderRole: 'mentor',
            message: message
        });
        await newMessage.save();
        
        // Populate the sender info to send back to the chat UI
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

        // Find the thread and update it (must be assigned to this mentor)
        const thread = await DoubtThread.findOneAndUpdate(
            { _id: threadId, mentorId: mentorId }, 
            { $set: { status: 'resolved', resolvedAt: resolutionTime } },
            { new: true }
        );

        if (!thread) {
            return res.status(404).json({ message: 'Doubt thread not found or not assigned to you.' });
        }

        // Start the 24-hour deletion timer for all messages in this thread
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

// module.exports = router; // <-- This line should already exist

module.exports = router;
