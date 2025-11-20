// functions/models/Leaderboard.js - Firestore Leaderboard Service
const admin = require('firebase-admin');
const { getCollection, db } = require('../config/firestore'); 

const LEADERBOARD_COLLECTION = 'leaderboards';
const leaderboardsCollection = getCollection(LEADERBOARD_COLLECTION);

/**
 * Maps a Firestore Leaderboard document to a standardized object.
 * @param {admin.firestore.DocumentSnapshot} doc 
 */
function mapFirestoreLeaderboard(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    
    // rankings is a critical array that must be preserved
    const leaderboardObject = { 
        _id: doc.id,
        type: data.type,
        period: data.period, // Will contain start/end dates
        rankings: data.rankings || [],
        lastUpdated: data.lastUpdated ? data.lastUpdated.toDate() : undefined,
    };

    // Add save method (for updates)
    leaderboardObject.save = async function() {
        const updateData = { 
            type: this.type,
            period: this.period,
            rankings: this.rankings,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
        await leaderboardsCollection.doc(this._id).update(updateData);
        return leaderboardObject;
    };

    return leaderboardObject;
}

/**
 * Service class replacing the Mongoose Leaderboard Model.
 */
class LeaderboardService {

    /**
     * Finds one leaderboard by type (replaces Mongoose.findOne).
     * NOTE: Since we only have one document per 'type', we use the 'type' field as a key.
     */
    static async findOne(query) {
         let ref = leaderboardsCollection;
         if (query.type) {
             ref = ref.where('type', '==', query.type);
         } else {
             return null;
         }
         
        const snapshot = await ref.limit(1).get();
        if (snapshot.empty) return null;
        return mapFirestoreLeaderboard(snapshot.docs[0]);
    }

    /**
     * Finds a leaderboard by its Firestore ID.
     */
    static async findById(id) {
        const doc = await leaderboardsCollection.doc(id).get();
        return mapFirestoreLeaderboard(doc);
    }
    
    /**
     * Creates a new Leaderboard document (replaces Mongoose constructor + save with upsert).
     */
    static async createOrReplace(data) {
        const { type, period, rankings } = data;
        
        // Check for existing document by type
        const snapshot = await leaderboardsCollection.where('type', '==', type).limit(1).get();
        
        const leaderboardData = {
            type: type,
            period: period || { start: new Date(0), end: null },
            rankings: rankings || [],
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: snapshot.empty ? admin.firestore.FieldValue.serverTimestamp() : snapshot.docs[0].data().createdAt 
        };

        if (snapshot.empty) {
            // Create new
            const docRef = await leaderboardsCollection.add(leaderboardData);
            return this.findById(docRef.id);
        } else {
            // Replace existing
            await snapshot.docs[0].ref.set(leaderboardData); // Use set to replace
            return this.findById(snapshot.docs[0].id);
        }
    }
    
    /**
     * Replaces Mongoose.updateOne with upsert logic (used in admin route).
     */
    static async updateOne(query, update, options) {
        if (!query.type) throw new Error('Query must contain type for Leaderboard update.');
        
        let existingDoc;
        const snapshot = await leaderboardsCollection.where('type', '==', query.type).limit(1).get();

        if (snapshot.empty && options.upsert) {
            // Handle upsert case: insert new document
            const dataToSet = {
                 ...update, // Assume update contains the full document structure
                 type: query.type,
                 createdAt: admin.firestore.FieldValue.serverTimestamp(),
                 lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            };
            const newDocRef = leaderboardsCollection.doc();
            await newDocRef.set(dataToSet);
            existingDoc = await this.findById(newDocRef.id);
        } else if (!snapshot.empty) {
            // Handle update case: update existing document
            await snapshot.docs[0].ref.update({
                ...update,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
            existingDoc = await this.findById(snapshot.docs[0].id);
        }
        
        return existingDoc;
    }
}

module.exports = LeaderboardService;