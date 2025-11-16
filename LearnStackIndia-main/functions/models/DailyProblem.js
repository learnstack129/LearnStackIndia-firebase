// backend/models/DailyProblem.js
const mongoose = require('mongoose');
require('./User');
const dailyProblemSchema = new mongoose.Schema({
    subject: { // e.g., "DSA Visualizer", "C Programming"
        type: String,
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: { // The problem statement (supports markdown)
        type: String,
        required: true
    },
    boilerplateCode: { // Mentor-provided starter code
        type: String,
        default: ''
    },
    solutionCode: { // Mentor-provided correct solution
        type: String,
        required: true
    },
    language: { // OneCompiler language name
        type: String,
        required: true,
        default: 'javascript' // e.g., "javascript", "python", "c", "cpp"
    },
    testCases: [{ // Hidden test cases
        input: { type: String, default: "" }, // stdin
        expectedOutput: { type: String, required: true, trim: true }
    }],
    pointsForAttempt: { // Points for the *first* run (pass or fail)
        type: Number,
        default: 20,
        min: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isActive: { // Toggled by mentor
        type: Boolean,
        default: false,
        index: true
    }
}, { timestamps: true });

// Index for finding the active problem for a subject quickly
dailyProblemSchema.index({ subject: 1, isActive: 1 });

module.exports = mongoose.model('DailyProblem', dailyProblemSchema);
