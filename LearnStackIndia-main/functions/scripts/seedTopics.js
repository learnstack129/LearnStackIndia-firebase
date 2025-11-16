// backend/scripts/seedTopics.js - MODIFIED
const mongoose = require('mongoose');
const Topic = require('../models/Topic');
require('dotenv').config();

const topicsData = [
  {
    id: 'searching',
    subject: 'DSA Visualizer', // <-- ADD THIS
    name: 'Searching Algorithms',
    description: 'Learn various searching techniques to find elements efficiently',
    icon: 'search',
    color: 'blue',
    order: 1,
    estimatedTime: 8,
    difficulty: 'beginner',
    prerequisites: [],
    algorithms: [
      {
        id: 'linearSearch',
        name: 'Linear Search',
        description: 'Sequential search through array elements',
        difficulty: 'easy',
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(1)',
        points: 50,
        prerequisites: []
      },
      {
        id: 'binarySearch',
        name: 'Binary Search',
        description: 'Efficient search in sorted arrays',
        difficulty: 'easy',
        timeComplexity: 'O(log n)',
        spaceComplexity: 'O(1)',
        points: 75,
        prerequisites: ['linearSearch']
      }
    ],
    isActive: true
  },
  {
    id: 'sorting',
    subject: 'DSA Visualizer', // <-- ADD THIS
    name: 'Sorting Algorithms',
    description: 'Master different sorting techniques and their applications',
    icon: 'sort-amount-up',
    color: 'green',
    order: 2,
    estimatedTime: 12,
    difficulty: 'beginner',
    prerequisites: [],
    algorithms: [
      {
        id: 'bubbleSort',
        name: 'Bubble Sort',
        description: 'Repeatedly swap adjacent elements',
        difficulty: 'easy',
        timeComplexity: 'O(n²)',
        spaceComplexity: 'O(1)',
        points: 50, // Points awarded for practice completion or visualization
        prerequisites: []
      },
      {
        id: 'selectionSort',
        name: 'Selection Sort',
        description: 'Find minimum and place at beginning',
        difficulty: 'easy',
        timeComplexity: 'O(n²)',
        spaceComplexity: 'O(1)',
        points: 50,
        prerequisites: []
      }
    ],
    isActive: true
  },
  // --- NEW SUBJECT EXAMPLE ---
  {
    id: 'cBasics',
    subject: 'C Programming', // <-- NEW SUBJECT
    name: 'C Programming Basics',
    description: 'Learn the fundamentals of C programming',
    icon: 'code',
    color: 'gray',
    order: 4,
    estimatedTime: 10,
    difficulty: 'beginner',
    prerequisites: [],
    algorithms: [
      { id: 'cIntro', name: 'Introduction to C', description: 'Hello, World!', difficulty: 'easy', timeComplexity: 'N/A', spaceComplexity: 'N/A', points: 10, prerequisites: [] },
      { id: 'cVariables', name: 'Variables & Data Types', description: 'Learn about int, char, float', difficulty: 'easy', timeComplexity: 'N/A', spaceComplexity: 'N/A', points: 15, prerequisites: ['cIntro'] }
    ],
    isActive: true
  }
];

async function seedTopics() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB!');

    console.log('🔄 Clearing existing topics...');
    await Topic.deleteMany({});

    console.log('🔄 Inserting topics...');
    await Topic.insertMany(topicsData);

    console.log(`✅ Successfully seeded ${topicsData.length} topics!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding topics:', error);
    process.exit(1);
  }
}


seedTopics();
