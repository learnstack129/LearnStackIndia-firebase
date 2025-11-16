// models/Topic.js - MODIFIED
const mongoose = require('mongoose');

const algorithmSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    required: true
  },
  timeComplexity: String,
  spaceComplexity: String,
  points: {
    type: Number,
    required: true,
    min: 0
  },
  prerequisites: [String],
  resources: [{
    type: {
      type: String,
      enum: ['video', 'article', 'code', 'visualization']
    },
    title: String,
    url: String,
    duration: Number // in minutes
  }],
  isGloballyLocked: {
    type: Boolean,
    default: false
  }
});

const topicSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  // --- NEW FIELD ---
  subject: {
    type: String,
    required: true,
    default: 'General', // A default subject
    index: true
  },
  // --- END NEW FIELD ---
  name: {
    type: String,
    required: true
  },
  description: String,
  icon: String,
  color: String,
  order: {
    type: Number,
    required: true
  },
  estimatedTime: {
    type: Number, // in hours
    required: true
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true
  },
  prerequisites: [String],
  algorithms: [algorithmSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  isGloballyLocked: { // Admin override to lock for everyone
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

topicSchema.index({ order: 1 });
topicSchema.index({ id: 1 });

module.exports = mongoose.model('Topic', topicSchema);
