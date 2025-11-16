// backend/models/Test.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('./User'); // <-- ADD THIS LINE
require('./Question');

const testSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Test title is required'],
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    password: {
        type: String,
        required: [true, 'Test password is required'],
        minlength: 4,
        select: false // Hide password by default
    },
    questions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question'
    }],
    isActive: {
        type: Boolean,
        default: false // Mentor must activate it
    }
}, {
    timestamps: true
});

// Hash password before saving
testSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

// Method to check password
testSchema.methods.correctPassword = async function(candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Test', testSchema);
