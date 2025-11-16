// functions/models/Achievement.js - Firestore Achievement Template Service
const admin = require('firebase-admin');
const { getCollection, db } = require('../config/firestore'); 

const ACHIEVEMENTS_COLLECTION = 'achievementTemplates';
const achievementsCollection = getCollection(ACHIEVEMENTS_COLLECTION);

/**
 * Maps a Firestore Achievement document to a standardized JavaScript object, 
 * mimicking the Mongoose .lean() output for consistency in routes.
 * @param {admin.firestore.DocumentSnapshot} doc 
 */
function mapFirestoreAchievement(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    
    // Convert criteria back to an object if needed, or rely on Firestore to handle simple objects.
    const achievementObject = { 
        _id: doc.id, // Keep _id for consistency in routes/references
        id: data.id, 
        name: data.name,
        description: data.description,
        icon: data.icon,
        category: data.category,
        points: data.points,
        criteria: data.criteria,
        isActive: data.isActive === undefined ? true : data.isActive,
        rarity: data.rarity,
        createdAt: data.createdAt ? data.createdAt.toDate() : undefined,
        updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
    };

    return achievementObject;
}

/**
 * Service class replacing the Mongoose AchievementTemplate Model.
 */
class AchievementService {

    /**
     * Finds achievements based on a query (replaces Mongoose.find/lean).
     */
    static async find(query = {}) {
        let ref = achievementsCollection;
        
        // Apply WHERE clauses (only supporting 'isActive' for now)
        if (query.isActive !== undefined) {
            ref = ref.where('isActive', '==', query.isActive);
        }

        const snapshot = await ref.get();
        return snapshot.docs.map(mapFirestoreAchievement);
    }
    
    /**
     * Finds one achievement by its MongoDB ID (used in admin routes).
     */
    static async findById(id) {
        const doc = await achievementsCollection.doc(id).get();
        return mapFirestoreAchievement(doc);
    }
    
    /**
     * Finds one achievement by its custom string ID (used for checks).
     */
    static async findOneById(id) {
        const snapshot = await achievementsCollection.where('id', '==', id).limit(1).get();
        if (snapshot.empty) return null;
        return mapFirestoreAchievement(snapshot.docs[0]);
    }
    
    /**
     * Creates a new Achievement document (replaces new AchievementTemplate() and .save()).
     */
    static async create(data) {
         // Simulate Mongoose uniqueness check on 'id' field
        const existing = await this.findOneById(data.id);
        if (existing) {
             const error = new Error(`Achievement ID '${data.id}' already exists.`);
             error.code = 11000;
             throw error;
        }

        const achievementData = {
            ...data,
            isActive: data.isActive === undefined ? true : data.isActive,
            rarity: data.rarity || 'common',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await achievementsCollection.add(achievementData);
        return this.findById(docRef.id);
    }
    
    /**
     * Updates an achievement by its ID (replaces findByIdAndUpdate).
     */
    static async findByIdAndUpdate(id, updateData) {
        const dataToUpdate = { 
            ...updateData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        // Remove undefined values
        Object.keys(dataToUpdate).forEach(key => dataToUpdate[key] === undefined && delete dataToUpdate[key]);
        
        await achievementsCollection.doc(id).update(dataToUpdate);
        return this.findById(id);
    }

    /**
     * Deletes an achievement by its MongoDB ID (replaces findByIdAndDelete).
     */
    static async findByIdAndDelete(id) {
        const achievement = await this.findById(id);
        if (achievement) {
            await achievementsCollection.doc(id).delete();
            return achievement;
        }
        return null;
    }
}

// Export the service class
module.exports = AchievementService;