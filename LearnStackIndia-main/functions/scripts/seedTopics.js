// functions/scripts/seedTopics.js - MODIFIED for Firestore

const admin = require('firebase-admin');
// Initialize the app if it hasn't been done elsewhere
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
const TOPICS_COLLECTION = 'topics';

// Topic Data (Remaining the same as your original data structure)
const topicsData = [
  {
    id: 'searching',
    subject: 'DSA Visualizer', 
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
    subject: 'DSA Visualizer', 
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
        points: 50, 
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
  {
    id: 'cBasics',
    subject: 'C Programming', 
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


// --- Seeding Function Implementation for Firestore ---
async function seedTopics() {
  console.log('🔄 Connecting to Firestore...');
  
  try {
    // 1. Delete Existing Documents (Batch delete is limited to 500 documents)
    const snapshot = await db.collection(TOPICS_COLLECTION).listDocuments();
    if (snapshot.length > 0) {
        console.log(`🔄 Clearing ${snapshot.length} existing topics...`);
        const deleteBatch = db.batch();
        snapshot.forEach(doc => {
            deleteBatch.delete(doc);
        });
        await deleteBatch.commit();
        console.log(`🗑️  Deleted ${snapshot.length} existing topics.`);
    } else {
         console.log('📝 No existing topics found.');
    }


    // 2. Insert New Documents
    console.log('🔄 Inserting new topics...');
    const insertBatch = db.batch();
    
    topicsData.forEach(topic => {
        // Prepare document data, including Firestore timestamps
        const topicData = {
            ...topic,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        // Use a new document reference with a generated ID
        const newDocRef = db.collection(TOPICS_COLLECTION).doc();
        insertBatch.set(newDocRef, topicData);
    });

    await insertBatch.commit();
    console.log(`✅ Successfully seeded ${topicsData.length} topics!`);
    
    // We use process.exit(0) for a standalone script execution
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding topics:', error);
    process.exit(1);
  }
}


seedTopics();