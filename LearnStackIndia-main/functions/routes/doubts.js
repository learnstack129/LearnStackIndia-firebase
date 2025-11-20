// functions/routes/doubts.js - MODIFIED to use Doubt Services

const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const UserService = require('../models/User'); // <-- Use UserService
const DoubtThreadService = require('../models/DoubtThread'); // <-- Use DoubtThreadService
const DoubtMessageService = require('../models/DoubtMessage'); // <-- Use DoubtMessageService
const { checkSubjectAccess } = require('../utils/accessControl'); 

const router = express.Router();

/**
 * Helper to perform 'populate' lookup on senderId for messages.
 */
async function populateMessages(messages) {
    const senderIds = [...new Set(messages.map(msg => msg.senderId).filter(id => id))];
    
    // NOTE: This is complex. For now, we manually look up each user.
    // In a final Firestore app, user details should be embedded in the message document.
    const userPromises = senderIds.map(id => UserService.findById(id));
    const users = await Promise.all(userPromises);
    const userMap = new Map(users.filter(u => u).map(u => [u.id, u]));

    return messages.map(msg => ({
        ...msg,
        // Add minimal populated sender data
        senderId: {
            username: userMap.get(msg.senderId)?.username || 'Unknown User',
            profile: {
                avatar: userMap.get(msg.senderId)?.profile?.avatar || null
            }
        }
    }));
}


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

        // CHANGE: Use DoubtThreadService.create
        const newThread = await DoubtThreadService.create({
            userId,
            subject,
            topicId,
            initialQuestion,
            status: 'new'
        });

        // CHANGE: Use DoubtMessageService.create
        const firstMessage = await DoubtMessageService.create({
            threadId: newThread._id,
            senderId: userId,
            senderRole: 'user',
            message: initialQuestion
        });

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
        // CHANGE: Use DoubtThreadService.find
        const threads = await DoubtThreadService.find({
            userId: userId,
            status: { $in: ['new', 'in-progress'] }
        }); // Default sort is newest first

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

        // CHANGE: Use DoubtThreadService.findOne
        const thread = await DoubtThreadService.findOne({ _id: threadId, userId: userId });
        if (!thread) {
            return res.status(404).json({ message: 'Doubt thread not found or access denied.' });
        }

        // CHANGE: Use DoubtMessageService.find
        const rawMessages = await DoubtMessageService.find({ threadId: threadId });
        // Manually populate sender data
        const messages = await populateMessages(rawMessages);
        
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

        // CHANGE: Use DoubtThreadService.findOne
        const thread = await DoubtThreadService.findOne({ _id: threadId, userId: userId });
        if (!thread) {
            return res.status(404).json({ message: 'Doubt thread not found or access denied.' });
        }

        // If a resolved thread gets a new user message, reopen it
        if (thread.status === 'resolved') {
            thread.status = 'in-progress';
            thread.resolvedAt = null; 
            // CHANGE: Update messages using service
            await DoubtMessageService.updateMany({ threadId: thread._id }, { $set: { resolvedAt: null } });
        }
        
        thread.updatedAt = new Date();
        await thread.save();

        // CHANGE: Use DoubtMessageService.create
        const newMessage = await DoubtMessageService.create({
            threadId: thread._id,
            senderId: userId,
            senderRole: 'user',
            message: message
        });
        
        // Manually populate the sender info
        const populatedMessage = (await populateMessages([newMessage]))[0];

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

        // CHANGE: Use DoubtThreadService.findOneAndUpdate
        const thread = await DoubtThreadService.findOneAndUpdate(
            { _id: threadId, userId: userId }, 
            { $set: { status: 'resolved', resolvedAt: resolutionTime } }
        );

        if (!thread) {
            return res.status(404).json({ message: 'Doubt thread not found or access denied.' });
        }

        // CHANGE: Use DoubtMessageService.updateMany
        await DoubtMessageService.updateMany(
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