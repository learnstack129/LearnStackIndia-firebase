// models/SubjectMeta.js - Stores metadata for subject strings
const mongoose = require('mongoose');

const subjectMetaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  icon: {
    type: String,
    required: [true, 'Icon is required'],
    default: 'book'
  },
  color: {
    type: String,
    required: [true, 'Color is required'],
    default: 'gray'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SubjectMeta', subjectMetaSchema);
