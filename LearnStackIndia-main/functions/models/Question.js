// backend/models/Question.js
const mongoose = require('mongoose');
require('./User');
const questionSchema = new mongoose.Schema({
    questionType: {
        type: String,
        enum: ['mcq', 'short_answer'],
        required: true,
        default: 'mcq'
    },
    text: {
        type: String,
        required: [true, 'Question text is required']
    },
    // --- Fields for MCQ ---
    options: [{
        type: String
    }],
    correctAnswerIndex: {
        type: Number
    },
    // --- Fields for Short Answer ---
    shortAnswers: [{ // An array of acceptable string answers
        type: String,
        trim: true
    }],
    // --- Common Fields ---
    timeLimit: {
        type: Number, // Time limit in seconds
        required: [true, 'A per-question time limit is required'],
        min: 10 // Minimum 10 seconds
    },
    createdBy: { // The mentor who created it
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    }
}, {
    timestamps: true
});

// --- Validation Hook ---
// This hook runs before saving to ensure the correct fields are present
// based on the questionType.
questionSchema.pre('save', function(next) {
    if (this.questionType === 'mcq') {
        if (!this.options || this.options.length < 2) {
            return next(new Error('MCQ questions must have at least 2 options.'));
        }
        if (this.correctAnswerIndex === null || this.correctAnswerIndex === undefined || this.correctAnswerIndex < 0) {
            return next(new Error('MCQ questions must have a valid correctAnswerIndex.'));
        }
        if (this.correctAnswerIndex >= this.options.length) {
             return next(new Error('correctAnswerIndex is out of bounds for the given options.'));
        }
        // Clear short answer field if it's an MCQ
        this.shortAnswers = undefined;
        
    } else if (this.questionType === 'short_answer') {
        if (!this.shortAnswers || this.shortAnswers.length === 0) {
            return next(new Error('Short Answer questions must have at least one acceptable answer.'));
        }
        // Clear MCQ fields if it's a short answer
        this.options = undefined;
        this.correctAnswerIndex = undefined;
    }
    next();
});

module.exports = mongoose.model('Question', questionSchema);
