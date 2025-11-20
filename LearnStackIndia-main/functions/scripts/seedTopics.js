// functions/scripts/seedTopics.js - FIXED VERSION 🔥

const admin = require("firebase-admin");

// Load service account
const serviceAccount = require("../serviceAccount.json");

// Initialize Firebase Admin with explicit credentials
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const TOPICS_COLLECTION = "topics";

// ---------------- TOPICS DATA -------------------
const topicsData = [
  {
    id: "searching",
    subject: "DSA Visualizer",
    name: "Searching Algorithms",
    description: "Learn various searching techniques to find elements efficiently",
    icon: "search",
    color: "blue",
    order: 1,
    estimatedTime: 8,
    difficulty: "beginner",
    prerequisites: [],
    algorithms: [
      {
        id: "linearSearch",
        name: "Linear Search",
        description: "Sequential search through array elements",
        difficulty: "easy",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        points: 50,
        prerequisites: [],
      },
      {
        id: "binarySearch",
        name: "Binary Search",
        description: "Efficient search in sorted arrays",
        difficulty: "easy",
        timeComplexity: "O(log n)",
        spaceComplexity: "O(1)",
        points: 75,
        prerequisites: ["linearSearch"],
      },
    ],
    isActive: true,
  },

  {
    id: "sorting",
    subject: "DSA Visualizer",
    name: "Sorting Algorithms",
    description: "Master different sorting techniques and their applications",
    icon: "sort-amount-up",
    color: "green",
    order: 2,
    estimatedTime: 12,
    difficulty: "beginner",
    prerequisites: [],
    algorithms: [
      {
        id: "bubbleSort",
        name: "Bubble Sort",
        description: "Repeatedly swap adjacent elements",
        difficulty: "easy",
        timeComplexity: "O(n²)",
        spaceComplexity: "O(1)",
        points: 50,
        prerequisites: [],
      },
      {
        id: "selectionSort",
        name: "Selection Sort",
        description: "Find minimum and place at beginning",
        difficulty: "easy",
        timeComplexity: "O(n²)",
        spaceComplexity: "O(1)",
        points: 50,
        prerequisites: [],
      },
    ],
    isActive: true,
  },

  {
    id: "cBasics",
    subject: "C Programming",
    name: "C Programming Basics",
    description: "Learn the fundamentals of C programming",
    icon: "code",
    color: "gray",
    order: 4,
    estimatedTime: 10,
    difficulty: "beginner",
    prerequisites: [],
    algorithms: [
      {
        id: "cIntro",
        name: "Introduction to C",
        description: "Hello, World!",
        difficulty: "easy",
        timeComplexity: "N/A",
        spaceComplexity: "N/A",
        points: 10,
        prerequisites: [],
      },
      {
        id: "cVariables",
        name: "Variables & Data Types",
        description: "Learn about int, char, float",
        difficulty: "easy",
        timeComplexity: "N/A",
        spaceComplexity: "N/A",
        points: 15,
        prerequisites: ["cIntro"],
      },
    ],
    isActive: true,
  },
];

// -----------------------------------------------------

async function seedTopics() {
  console.log("🚀 Connecting to Firestore using serviceAccount...");

  try {
    // Delete existing
    const docs = await db.collection(TOPICS_COLLECTION).listDocuments();
    if (docs.length > 0) {
      console.log(`🗑️ Deleting ${docs.length} old topics...`);
      const batch = db.batch();
      docs.forEach((d) => batch.delete(d));
      await batch.commit();
    }

    // Insert new
    console.log("📥 Inserting new topics...");
    const batch = db.batch();

    topicsData.forEach((topic) => {
      const ref = db.collection(TOPICS_COLLECTION).doc(topic.id);
      batch.set(ref, {
        ...topic,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    console.log(`✅ Successfully seeded ${topicsData.length} topics`);
    process.exit(0);

  } catch (err) {
    console.error("❌ Error seeding topics:", err);
    process.exit(1);
  }
}

seedTopics();
