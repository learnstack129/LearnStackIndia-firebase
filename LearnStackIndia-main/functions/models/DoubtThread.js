// backend/models/DoubtThread.js
const mongoose = require('mongoose');
require('./User');
const doubtThreadSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    mentorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
        default: null
    },
    subject: {
        type: String,
        required: true,
        index: true
    },
    topicId: {
        type: String, // e.g., "sorting", "cBasics"
        required: true
    },
    initialQuestion: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000
    },
    status: {
        type: String,
        enum: ['new', 'in-progress', 'resolved'],
        default: 'new',
        index: true
    },
    resolvedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true // Adds createdAt and updatedAt
});

// --- Automatic Deletion ---
// This creates a TTL (Time-To-Live) index.
// MongoDB will automatically delete any document 86400 seconds (24 hours)
// *after* the 'resolvedAt' time.
// We only set 'resolvedAt' when the doubt is finished.
doubtThreadSchema.index({ "resolvedAt": 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('DoubtThread', doubtThreadSchema);
