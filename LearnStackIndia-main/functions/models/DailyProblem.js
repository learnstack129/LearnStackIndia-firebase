// functions/models/DailyProblem.js - Firestore DailyProblem Service
const admin = require('firebase-admin');
const { getCollection, db } = require('../config/firestore'); 

const DAILY_PROBLEM_COLLECTION = 'dailyProblems';
const dailyProblemCollection = getCollection(DAILY_PROBLEM_COLLECTION);

/**
 * Maps a Firestore DailyProblem document to a standardized object.
 * @param {admin.firestore.DocumentSnapshot} doc 
 */
function mapFirestoreDailyProblem(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    
    const problemObject = { 
        _id: doc.id, // Use Firestore ID as the primary key
        subject: data.subject,
        title: data.title,
        description: data.description,
        boilerplateCode: data.boilerplateCode,
        solutionCode: data.solutionCode,
        language: data.language,
        testCases: data.testCases || [],
        pointsForAttempt: data.pointsForAttempt || 20,
        createdBy: data.createdBy, // Stays as a string/ID
        isActive: data.isActive === undefined ? false : data.isActive,
        createdAt: data.createdAt ? data.createdAt.toDate() : undefined,
        updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
    };

    // Add save method (for updates like isActive toggle)
    problemObject.save = async function() {
        const updateData = { 
            subject: this.subject,
            title: this.title,
            description: this.description,
            boilerplateCode: this.boilerplateCode,
            solutionCode: this.solutionCode,
            language: this.language,
            testCases: this.testCases,
            pointsForAttempt: this.pointsForAttempt,
            createdBy: this.createdBy,
            isActive: this.isActive,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await dailyProblemCollection.doc(this._id).update(updateData);
        return problemObject;
    };

    return problemObject;
}

/**
 * Service class replacing the Mongoose DailyProblem Model.
 */
class DailyProblemService {

    /**
     * Finds problems based on query (replaces Mongoose.findOne).
     */
    static async findOne(query) {
         let ref = dailyProblemCollection;
         
         if (query.subject) {
             ref = ref.where('subject', '==', query.subject);
         }
         if (query.isActive !== undefined) {
             ref = ref.where('isActive', '==', query.isActive);
         }
         
        const snapshot = await ref.limit(1).get();
        if (snapshot.empty) return null;
        return mapFirestoreDailyProblem(snapshot.docs[0]);
    }

    /**
     * Finds a problem by its Firestore ID (replaces findById).
     */
    static async findById(id) {
        const doc = await dailyProblemCollection.doc(id).get();
        return mapFirestoreDailyProblem(doc);
    }
    
    /**
     * Creates a new DailyProblem document.
     */
    static async create(data) {
        const problemData = {
            ...data,
            pointsForAttempt: data.pointsForAttempt || 20,
            createdBy: data.createdBy,
            isActive: data.isActive === undefined ? false : data.isActive,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        // Simple client-side validation for required fields
        if (!problemData.title || !problemData.subject || !problemData.solutionCode) {
            throw { name: 'ValidationError', message: 'Title, Subject, and Solution Code are required.' };
        }
        
        const docRef = await dailyProblemCollection.add(problemData);
        return this.findById(docRef.id);
    }
    
    /**
     * Replaces Mongoose.find
     */
    static async find(query = {}) {
        let ref = dailyProblemCollection;
         
         if (query.createdBy) {
             ref = ref.where('createdBy', '==', query.createdBy);
         }

        // Default sort by subject, then createdAt (Firestore requires index for multiple sorts)
        ref = ref.orderBy('subject', 'asc').orderBy('createdAt', 'desc');

        const snapshot = await ref.get();
        return snapshot.docs.map(mapFirestoreDailyProblem);
    }
    
    /**
     * Replaces Mongoose.updateMany for activation logic.
     */
    static async updateMany(query, update) {
         let ref = dailyProblemCollection;
         let batch = db.batch();
         let count = 0;
         
         // Only supporting update by subject/id for activation logic
         if (query.subject) {
            ref = ref.where('subject', '==', query.subject);
            
            if (query._id && query._id.$ne) {
                 // Find all *except* the one being activated
                 ref = ref.where(admin.firestore.FieldPath.documentId(), '!=', query._id.$ne);
            }
         }
        
        const docsToUpdate = await ref.get();
        
        docsToUpdate.forEach(doc => {
             // update.$set contains { isActive: false }
             batch.update(doc.ref, { ...update.$set, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
             count++;
        });
        
        if (count > 0) {
            await batch.commit();
        }
        return { modifiedCount: count };
    }
}

// Export the service class
module.exports = DailyProblemService;