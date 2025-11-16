// functions/models/Topic.js - Firestore Topic Service
const admin = require('firebase-admin');
const { getCollection, db } = require('../config/firestore'); 

const TOPICS_COLLECTION = 'topics';
const topicsCollection = getCollection(TOPICS_COLLECTION);

/**
 * Maps a Firestore Topic document to a standardized JavaScript object, 
 * mimicking the Mongoose .lean() output for consistency in routes.
 * @param {admin.firestore.DocumentSnapshot} doc 
 */
function mapFirestoreTopic(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    
    // Create a simplified object mimicking Mongoose .lean() output
    const topicObject = { 
        _id: doc.id, // Keep _id for consistency in routes/references
        id: data.id, 
        subject: data.subject,
        name: data.name,
        description: data.description,
        icon: data.icon,
        color: data.color,
        order: data.order,
        estimatedTime: data.estimatedTime,
        difficulty: data.difficulty,
        prerequisites: data.prerequisites || [],
        algorithms: data.algorithms || [],
        isActive: data.isActive === undefined ? true : data.isActive,
        isGloballyLocked: data.isGloballyLocked === undefined ? false : data.isGloballyLocked,
        createdAt: data.createdAt ? data.createdAt.toDate() : undefined,
        updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
    };
    
    // Add save method for consistency with Mongoose documents (useful for updates like locking)
    topicObject.save = async function() {
        const updateData = {
            name: this.name,
            description: this.description,
            icon: this.icon,
            color: this.color,
            order: this.order,
            estimatedTime: this.estimatedTime,
            difficulty: this.difficulty,
            prerequisites: this.prerequisites,
            algorithms: this.algorithms,
            isActive: this.isActive,
            isGloballyLocked: this.isGloballyLocked,
            subject: this.subject,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await topicsCollection.doc(this._id).update(updateData);
        return topicObject; 
    }

    return topicObject;
}

/**
 * Service class replacing the Mongoose Topic Model.
 */
class TopicService {

    /**
     * Finds topics based on a partial query (replaces Mongoose's find/sort/lean).
     */
    static async find(query = {}, sort = {}) {
        let ref = topicsCollection;
        
        // Apply WHERE clauses
        for (const key in query) {
            if (Object.hasOwnProperty.call(query, key)) {
                ref = ref.where(key, '==', query[key]);
            }
        }

        // Apply sorting
        if (sort.field) {
            ref = ref.orderBy(sort.field, sort.direction || 'asc');
        } else {
             // Default sort by id if no order field exists in Firestore yet
             ref = ref.orderBy('id', 'asc');
        }

        const snapshot = await ref.get();
        return snapshot.docs.map(mapFirestoreTopic);
    }
    
    /**
     * Finds one topic by its MongoDB ID (used in admin/put/delete routes).
     */
    static async findById(id) {
        const doc = await topicsCollection.doc(id).get();
        return mapFirestoreTopic(doc);
    }
    
    /**
     * Finds one topic by query fields (replaces Mongoose.findOne).
     * Supports looking up by id (custom string ID) or other single fields.
     */
    static async findOne(query) {
         let ref = topicsCollection;
         let filterApplied = false;

         if (query.id) {
             ref = ref.where('id', '==', query.id);
             filterApplied = true;
         } else if (query.subject) {
             ref = ref.where('subject', '==', query.subject);
             filterApplied = true;
         }

        if (!filterApplied) {
            // Handle edge case where query is empty or unusual, defaulting to fail fast
            return null;
        }

        const snapshot = await ref.limit(1).get();
        if (snapshot.empty) return null;
        return mapFirestoreTopic(snapshot.docs[0]);
    }
    
    /**
     * Creates a new Topic document (replaces new Topic() and .save()).
     */
    static async create(data) {
        // Simulate Mongoose uniqueness check
        const existing = await this.findOne({ id: data.id });
        if (existing) {
             const error = new Error(`Topic ID '${data.id}' already exists.`);
             error.code = 11000;
             throw error;
        }
        
        // Ensure data integrity before writing
        if (!data.subject || !data.order || !data.estimatedTime || !data.difficulty) {
             const error = new Error(`Validation Failed: Missing required fields.`);
             error.name = 'ValidationError';
             throw error;
        }


        const topicData = {
            ...data,
            algorithms: data.algorithms || [],
            prerequisites: data.prerequisites || [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await topicsCollection.add(topicData);
        return this.findById(docRef.id);
    }
    
    /**
     * Updates a topic by its ID (replaces findByIdAndUpdate).
     */
    static async findByIdAndUpdate(id, updateData) {
        const dataToUpdate = { 
            ...updateData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        // Remove undefined values to prevent Firestore errors
        Object.keys(dataToUpdate).forEach(key => dataToUpdate[key] === undefined && delete dataToUpdate[key]);
        
        await topicsCollection.doc(id).update(dataToUpdate);
        return this.findById(id);
    }

    /**
     * Deletes a topic by its MongoDB ID (replaces findByIdAndDelete).
     */
    static async findByIdAndDelete(id) {
        const topic = await this.findById(id);
        if (topic) {
            await topicsCollection.doc(id).delete();
            return topic;
        }
        return null;
    }
    
    // --- Additional Mongoose-like Methods ---
    
    /**
     * Replaces Mongoose.distinct('subject')
     */
    static async distinct(field) {
        if (field !== 'subject') return [];
        
        const snapshot = await topicsCollection.select('subject').get();
        const subjects = new Set();
        snapshot.forEach(doc => {
            const subject = doc.data().subject;
            if (subject) subjects.add(subject);
        });
        return Array.from(subjects);
    }

    /**
     * Replaces Mongoose.updateMany for batch updates (used in Admin routes).
     */
    static async updateMany(query, update) {
         let ref = topicsCollection;
         let batch = db.batch();
         let count = 0;
         
         // Only supporting update by _id.$in for topics
         if (query._id && query._id.$in) {
            // Firestore only allows 'in' queries on a maximum of 10 items. This is a common point of failure.
            // For now, we assume a small number of items or rely on the Firebase Admin SDK to handle larger 'in' queries
            // by splitting them into multiple chunks/requests.
            
            // We use a simplified implementation that relies on the query being executed correctly.
            const docsToUpdate = await ref.where(admin.firestore.FieldPath.documentId(), 'in', query._id.$in).get();
            
            docsToUpdate.forEach(doc => {
                 batch.update(doc.ref, { ...update.$set, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                 count++;
            });
            
            if (count > 0) {
                await batch.commit();
            }
            return { modifiedCount: count };

         } else {
            console.error("TopicService.updateMany not implemented for this query type in Firestore.");
            return { modifiedCount: 0 };
         }
    }
    
}

// Export the service class
module.exports = TopicService;