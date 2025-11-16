// backend/models/DoubtMessage.js
const mongoose = require('mongoose');
require('./User'); // <-- ADD THIS LINE
require('./DoubtThread');

const doubtMessageSchema = new mongoose.Schema({
    threadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DoubtThread',
        required: true,
        index: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderRole: {
        type: String,
        enum: ['user', 'mentor'],
        required: true
    },
    message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000
    },
    resolvedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true // Adds createdAt
});

// --- Automatic Deletion ---
// We add the same TTL index here.
// When a thread is resolved, we will update 'resolvedAt' for all its
// messages, and MongoDB will clean them up 24 hours later with the thread.
doubtMessageSchema.index({ "resolvedAt": 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('DoubtMessage', doubtMessageSchema);
