const mongoose = require('mongoose');
const AchievementTemplate = require('../models/Achievement');
require('dotenv').config();

// Complete achievement templates to seed
const achievementTemplates = [
  // LEARNING ACHIEVEMENTS
  {
    id: "search_master",
    name: "Search Master", 
    description: "Complete all searching algorithms",
    icon: "search",
    category: "learning",
    points: 500,
    criteria: { type: "complete_topic", value: "searching" },
    rarity: "epic"
  },
  {
    id: "sort_specialist",
    name: "Sort Specialist",
    description: "Complete all sorting algorithms", 
    icon: "bar-chart",
    category: "learning",
    points: 600,
    criteria: { type: "complete_topic", value: "sorting" },
    rarity: "epic"
  },
  {
    id: "stack_champion",
    name: "Stack Champion",
    description: "Master all stack algorithms",
    icon: "layers",
    category: "learning", 
    points: 400,
    criteria: { type: "complete_topic", value: "stack" },
    rarity: "rare"
  },
  {
    id: "queue_master",
    name: "Queue Master",
    description: "Complete all queue algorithms",
    icon: "arrow-right",
    category: "learning",
    points: 400, 
    criteria: { type: "complete_topic", value: "queue" },
    rarity: "rare"
  },
  {
    id: "linked_list_guru", 
    name: "Linked List Guru",
    description: "Master all linked list algorithms",
    icon: "link",
    category: "learning",
    points: 450,
    criteria: { type: "complete_topic", value: "linkedList" },
    rarity: "rare"
  },
  {
    id: "tree_expert",
    name: "Tree Expert", 
    description: "Complete all tree algorithms",
    icon: "tree",
    category: "learning",
    points: 700,
    criteria: { type: "complete_topic", value: "tree" },
    rarity: "legendary"
  },
  {
    id: "graph_wizard",
    name: "Graph Wizard",
    description: "Master all graph algorithms",
    icon: "network",
    category: "learning",
    points: 800,
    criteria: { type: "complete_topic", value: "graph" },
    rarity: "legendary"
  },
  {
    id: "hash_hero",
    name: "Hash Hero",
    description: "Complete all hash table algorithms",
    icon: "hash",
    category: "learning", 
    points: 500,
    criteria: { type: "complete_topic", value: "hashTable" },
    rarity: "epic"
  },
  {
    id: "algorithm_explorer",
    name: "Algorithm Explorer",
    description: "Complete your first algorithm",
    icon: "compass",
    category: "learning",
    points: 50,
    criteria: { type: "first_completion", value: 1 },
    rarity: "common"
  },
  {
    id: "rookie_learner",
    name: "Rookie Learner", 
    description: "Complete 5 algorithms",
    icon: "user",
    category: "learning",
    points: 100,
    criteria: { type: "algorithms_completed", value: 5 },
    rarity: "common"
  },
  {
    id: "dedicated_student",
    name: "Dedicated Student",
    description: "Complete 25 algorithms",
    icon: "book-open",
    category: "learning",
    points: 300,
    criteria: { type: "algorithms_completed", value: 25 },
    rarity: "rare"
  },
  {
    id: "algorithm_master",
    name: "Algorithm Master",
    description: "Complete all 64 algorithms",
    icon: "crown",
    category: "mastery",
    points: 2000,
    criteria: { type: "algorithms_completed", value: 64 },
    rarity: "legendary"
  },

  // PERFORMANCE ACHIEVEMENTS
  {
    id: "speed_demon",
    name: "Speed Demon",
    description: "Complete 10 algorithms in under 30 seconds each",
    icon: "zap",
    category: "performance",
    points: 300,
    criteria: { type: "speed_completion", value: 10 },
    rarity: "rare"
  },
  {
    id: "lightning_fast",
    name: "Lightning Fast",
    description: "Complete any algorithm in under 15 seconds",
    icon: "flash",
    category: "performance", 
    points: 150,
    criteria: { type: "time_limit", value: { seconds: 15 } },
    rarity: "rare"
  },
  {
    id: "precision_master",
    name: "Precision Master",
    description: "Achieve 100% accuracy on any algorithm",
    icon: "target",
    category: "performance",
    points: 100,
    criteria: { type: "perfect_accuracy", value: 100 },
    rarity: "common"
  },
  {
    id: "accuracy_legend",
    name: "Accuracy Legend", 
    description: "Maintain 95%+ accuracy across 20 algorithms",
    icon: "award",
    category: "performance",
    points: 400,
    criteria: { type: "high_accuracy_streak", value: { accuracy: 95, count: 20 } },
    rarity: "epic"
  },
  {
    id: "efficient_coder",
    name: "Efficient Coder",
    description: "Complete 5 algorithms with 90%+ accuracy in under 45 seconds",
    icon: "cpu",
    category: "performance",
    points: 250,
    criteria: { type: "efficiency_combo", value: { accuracy: 90, time: 45, count: 5 } },
    rarity: "rare"
  },
  {
    id: "no_mistakes",
    name: "No Mistakes",
    description: "Complete 10 algorithms in a row with 100% accuracy",
    icon: "check-circle",
    category: "performance",
    points: 350,
    criteria: { type: "perfect_streak", value: 10 },
    rarity: "epic"
  },

  // CONSISTENCY ACHIEVEMENTS  
  {
    id: "rising_star",
    name: "Rising Star",
    description: "Maintain a 3-day learning streak",
    icon: "star",
    category: "consistency",
    points: 100,
    criteria: { type: "streak", value: 3 },
    rarity: "common"
  },
  {
    id: "consistent_learner",
    name: "Consistent Learner", 
    description: "Maintain a 7-day learning streak",
    icon: "calendar",
    category: "consistency",
    points: 250,
    criteria: { type: "streak", value: 7 },
    rarity: "rare"
  },
  {
    id: "dedication_master",
    name: "Dedication Master",
    description: "Maintain a 30-day learning streak",
    icon: "flame",
    category: "consistency", 
    points: 500,
    criteria: { type: "streak", value: 30 },
    rarity: "epic"
  },
  {
    id: "unstoppable_force",
    name: "Unstoppable Force",
    description: "Maintain a 100-day learning streak",
    icon: "infinity",
    category: "consistency",
    points: 1000,
    criteria: { type: "streak", value: 100 },
    rarity: "legendary"
  },
  {
    id: "daily_grind",
    name: "Daily Grind",
    description: "Study for at least 30 minutes daily for 7 days",
    icon: "clock",
    category: "consistency",
    points: 200,
    criteria: { type: "daily_time", value: { minutes: 30, days: 7 } },
    rarity: "common"
  },
  {
    id: "time_commitment",
    name: "Time Commitment",
    description: "Spend 10+ hours learning this month",
    icon: "hourglass",
    category: "consistency",
    points: 300,
    criteria: { type: "monthly_time", value: 600 }, // 600 minutes = 10 hours
    rarity: "rare"
  },

  // MASTERY ACHIEVEMENTS
  {
    id: "bronze_rank",
    name: "Bronze Achiever",
    description: "Reach Bronze rank",
    icon: "medal",
    category: "mastery", 
    points: 100,
    criteria: { type: "reach_rank", value: "Bronze" },
    rarity: "common"
  },
  {
    id: "silver_rank",
    name: "Silver Champion", 
    description: "Reach Silver rank",
    icon: "award",
    category: "mastery",
    points: 300,
    criteria: { type: "reach_rank", value: "Silver" },
    rarity: "rare"
  },
  {
    id: "gold_rank",
    name: "Gold Master",
    description: "Reach Gold rank",
    icon: "trophy",
    category: "mastery",
    points: 500,
    criteria: { type: "reach_rank", value: "Gold" },
    rarity: "epic"
  },
  {
    id: "platinum_rank", 
    name: "Platinum Legend",
    description: "Reach Platinum rank",
    icon: "gem",
    category: "mastery",
    points: 800,
    criteria: { type: "reach_rank", value: "Platinum" },
    rarity: "legendary"
  },
  {
    id: "diamond_rank",
    name: "Diamond Elite",
    description: "Reach Diamond rank",
    icon: "diamond",
    category: "mastery",
    points: 1200,
    criteria: { type: "reach_rank", value: "Diamond" },
    rarity: "legendary"
  },
  {
    id: "point_collector",
    name: "Point Collector",
    description: "Earn 1000 total points",
    icon: "dollar-sign",
    category: "mastery",
    points: 200,
    criteria: { type: "total_points", value: 1000 },
    rarity: "common"
  },
  {
    id: "point_hoarder",
    name: "Point Hoarder", 
    description: "Earn 5000 total points",
    icon: "coins",
    category: "mastery",
    points: 500,
    criteria: { type: "total_points", value: 5000 },
    rarity: "epic"
  },

  // SPECIAL ACHIEVEMENTS
  {
    id: "night_owl",
    name: "Night Owl",
    description: "Complete algorithms between 10 PM - 6 AM",
    icon: "moon",
    category: "special",
    points: 100,
    criteria: { type: "time_range", value: { start: 22, end: 6, count: 5 } },
    rarity: "rare"
  },
  {
    id: "early_bird",
    name: "Early Bird",
    description: "Complete algorithms between 5 AM - 8 AM",
    icon: "sunrise",
    category: "special",
    points: 100, 
    criteria: { type: "time_range", value: { start: 5, end: 8, count: 5 } },
    rarity: "rare"
  },
  {
    id: "weekend_warrior",
    name: "Weekend Warrior",
    description: "Complete 10 algorithms on weekends",
    icon: "weekend",
    category: "special",
    points: 150,
    criteria: { type: "weekend_completion", value: 10 },
    rarity: "common"
  },
  {
    id: "comeback_kid",
    name: "Comeback Kid",
    description: "Return after a 7+ day break and complete 5 algorithms",
    icon: "refresh",
    category: "special", 
    points: 200,
    criteria: { type: "comeback", value: { break_days: 7, algorithms: 5 } },
    rarity: "rare"
  },
  {
    id: "perfectionist",
    name: "Perfectionist",
    description: "Complete a full topic with 100% accuracy on all algorithms",
    icon: "check-square",
    category: "special",
    points: 400,
    criteria: { type: "perfect_topic", value: 100 },
    rarity: "epic"
  },
  {
    id: "first_login",
    name: "Welcome Aboard!",
    description: "Complete your first login to the platform",
    icon: "log-in",
    category: "special",
    points: 25,
    criteria: { type: "first_login", value: 1 },
    rarity: "common"
  },
  {
    id: "profile_complete",
    name: "Profile Master",
    description: "Complete your user profile information",
    icon: "user-check",
    category: "special",
    points: 50,
    criteria: { type: "profile_complete", value: true },
    rarity: "common"
  }
];

async function seedAchievements() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully!');
    
    console.log('🔄 Clearing existing achievement templates...');
    const deleteResult = await AchievementTemplate.deleteMany({});
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing templates`);
    
    console.log('🔄 Inserting new achievement templates...');
    const insertResult = await AchievementTemplate.insertMany(achievementTemplates);
    console.log(`✅ Successfully inserted ${insertResult.length} achievement templates!`);
    
    // Display summary by category
    const categories = {};
    achievementTemplates.forEach(achievement => {
      categories[achievement.category] = (categories[achievement.category] || 0) + 1;
    });
    
    console.log('\n📊 Achievement Templates Summary:');
    Object.keys(categories).forEach(category => {
      console.log(`   ${category}: ${categories[category]} achievements`);
    });
    
    console.log('\n🎉 Achievement templates seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding achievements:', error);
    process.exit(1);
  }
}

// Run the seeding function
seedAchievements();