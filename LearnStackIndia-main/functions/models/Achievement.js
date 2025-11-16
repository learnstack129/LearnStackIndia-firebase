// models/Achievement.js - Achievement Template Model
const mongoose = require('mongoose');

const achievementTemplateSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['learning', 'performance', 'consistency', 'mastery', 'special'],
    required: true
  },
  points: {
    type: Number,
    required: true,
    min: 0
  },
  criteria: {
    type: {
      type: String,
      required: true
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  rarity: {
    type: String,
    enum: ['common', 'rare', 'epic', 'legendary'],
    default: 'common'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AchievementTemplate', achievementTemplateSchema);