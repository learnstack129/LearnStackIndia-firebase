// backend/routes/doubts.js
const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const User = require('../models/User'); // <-- MOVED UP
const DoubtThread = require('../models/DoubtThread');
const DoubtMessage = require('../models/DoubtMessage');
const { checkSubjectAccess } = require('../utils/accessControl'); 
const router = express.Router();

// 1. POST: User creates a new doubt
router.post('/new', auth, async (req, res) => {
    try {
        const { subject, topicId, initialQuestion } = req.body;
        const userId = req.user.id;

        if (!subject || !topicId || !initialQuestion) {
            return res.status(400).json({ message: 'Subject, topicId, and initialQuestion are required.' });
        }

        // --- SECURITY CHECK ---
        const hasAccess = await checkSubjectAccess(userId, subject);
        if (!hasAccess) {
            return res.status(403).json({ message: 'Access denied. You must unlock this subject to ask doubts.' });
        }
        // --- END SECURITY CHECK ---

        // Create the main thread
        const newThread = new DoubtThread({
            userId,
            subject,
            topicId,
            initialQuestion,
            status: 'new'
        });
        await newThread.save();

        // Create the first message in that thread
        const firstMessage = new DoubtMessage({
            threadId: newThread._id,
            senderId: userId,
            senderRole: 'user',
            message: initialQuestion
        });
        await firstMessage.save();

        res.status(201).json({ success: true, message: 'Doubt submitted successfully.', thread: newThread });

    } catch (error) {
        console.error('Error creating new doubt:', error);
        res.status(500).json({ message: 'Server error while submitting doubt.' });
    }
});

// 2. GET: User fetches their active (new or in-progress) threads
router.get('/my-threads', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const threads = await DoubtThread.find({
            userId: userId,
            status: { $in: ['new', 'in-progress'] }
        }).sort({ updatedAt: -1 }); // Show most recently active first

        res.json({ success: true, threads });

    } catch (error) {
        console.error('Error fetching user threads:', error);
        res.status(500).json({ message: 'Server error fetching threads.' });
    }
});

// 3. GET: User gets all messages for one of their threads
router.get('/thread/:threadId', auth, async (req, res) => {
    try {
        const { threadId } = req.params;
        const userId = req.user.id;

        // Verify this thread exists and belongs to the user
        const thread = await DoubtThread.findOne({ _id: threadId, userId: userId });
        if (!thread) {
            return res.status(404).json({ message: 'Doubt thread not found or access denied.' });
        }

        // Fetch all messages for this thread
       const messages = await DoubtMessage.find({ threadId: threadId })
            .populate('senderId', 'username profile.avatar')
            .sort({ createdAt: 1 }); // Show in chronological order
        res.json({ success: true, thread, messages });

    } catch (error) {
        console.error('Error fetching thread messages:', error);
        res.status(500).json({ message: 'Server error fetching messages.' });
    }
});

// 4. POST: User sends a reply to their thread
router.post('/thread/:threadId/reply', auth, async (req, res) => {
    try {
        const { threadId } = req.params;
        const { message } = req.body;
        const userId = req.user.id;

        if (!message) {
            return res.status(400).json({ message: 'Message content is required.' });
        }

        // Verify this thread exists and belongs to the user
        const thread = await DoubtThread.findOne({ _id: threadId, userId: userId });
        if (!thread) {
            return res.status(404).json({ message: 'Doubt thread not found or access denied.' });
        }

        // If a resolved thread gets a new user message, reopen it
        if (thread.status === 'resolved') {
            thread.status = 'in-progress'; // Re-open the thread
            thread.resolvedAt = null; // Clear the deletion timer

            // We must also clear the deletion timer on all associated messages
            await DoubtMessage.updateMany({ threadId: thread._id }, { $set: { resolvedAt: null } });
        }
        
        // Mark the thread as updated
        thread.updatedAt = new Date();
        await thread.save();

        // Create the new message
        const newMessage = new DoubtMessage({
            threadId: thread._id,
            senderId: userId,
            senderRole: 'user',
            message: message
        });
        await newMessage.save();
        
        // Populate the sender info to send back to the chat UI
        const populatedMessage = await DoubtMessage.findById(newMessage._id)
            .populate('senderId', 'username profile.avatar')

        res.status(201).json({ success: true, message: 'Reply sent.', newMessage: populatedMessage });

    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({ message: 'Server error sending reply.' });
    }
});

// 5. POST: User resolves their own thread
router.post('/thread/:threadId/resolve', auth, async (req, res) => {
    try {
        const { threadId } = req.params;
        const userId = req.user.id;
        const resolutionTime = new Date();

        // Find the thread and update it
        const thread = await DoubtThread.findOneAndUpdate(
            { _id: threadId, userId: userId }, // Ensure user owns it
            { $set: { status: 'resolved', resolvedAt: resolutionTime } },
            { new: true } // Return the updated document
        );

        if (!thread) {
            return res.status(404).json({ message: 'Doubt thread not found or access denied.' });
        }

        // Start the 24-hour deletion timer for all messages in this thread
        await DoubtMessage.updateMany(
            { threadId: thread._id },
            { $set: { resolvedAt: resolutionTime } }
        );

        res.json({ success: true, message: 'Thread marked as resolved. It will be deleted in 24 hours.', thread });

    } catch (error) {
        console.error('Error resolving thread:', error);
        res.status(500).json({ message: 'Server error resolving thread.' });
    }
});


module.exports = router;
