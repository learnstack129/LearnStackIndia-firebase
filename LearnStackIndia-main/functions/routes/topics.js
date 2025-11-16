// functions/routes/topics.js - MODIFIED to use TopicService

const express = require('express');
const TopicService = require('../models/Topic'); // <-- CHANGE: Use TopicService
const auth = require('../middleware/auth');

const router = express.Router();

// Get all topics
router.get('/', async (req, res) => {
  try {
    // CHANGE: Use TopicService.find with query and sort object
    const topics = await TopicService.find({ isActive: true }, { field: 'order', direction: 'asc' });
    res.json({
      success: true,
      topics
    });
  } catch (error) {
    console.error('❌ Error fetching topics:', error);
    res.status(500).json({ message: 'Error fetching topics' });
  }
});

// Get single topic by ID
router.get('/:id', async (req, res) => {
  try {
    // CHANGE: Use TopicService.findOne by custom ID and active status
    const topic = await TopicService.findOne({ id: req.params.id, isActive: true });
    
    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }
    
    res.json({
      success: true,
      topic
    });
  } catch (error) {
    console.error('❌ Error fetching topic:', error);
    res.status(500).json({ message: 'Error fetching topic' });
  }
});

// Get algorithms for a topic
router.get('/:id/algorithms', async (req, res) => {
  try {
    // CHANGE: Use TopicService.findOne by custom ID and active status
    const topic = await TopicService.findOne({ id: req.params.id, isActive: true });
    
    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }
    
    res.json({
      success: true,
      algorithms: topic.algorithms
    });
  } catch (error) {
    console.error('❌ Error fetching algorithms:', error);
    res.status(500).json({ message: 'Error fetching algorithms' });
  }
});

module.exports = router;