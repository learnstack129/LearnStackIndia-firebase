// functions/models/DoubtMessage.js - Firestore DoubtMessage Service
const admin = require('firebase-admin');
const { getCollection, db } = require('../config/firestore'); 

const DOUBT_MESSAGES_COLLECTION = 'doubtMessages';
const doubtMessagesCollection = getCollection(DOUBT_MESSAGES_COLLECTION);

/**
 * Maps a Firestore DoubtMessage document to a standardized object.
 * @param {admin.firestore.DocumentSnapshot} doc 
 */
function mapFirestoreDoubtMessage(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    
    const messageObject = { 
        _id: doc.id,
        threadId: data.threadId, 
        senderId: data.senderId, // Stays as string/ID
        senderRole: data.senderRole,
        message: data.message,
        resolvedAt: data.resolvedAt ? data.resolvedAt.toDate() : null,
        createdAt: data.createdAt ? data.createdAt.toDate() : undefined,
    };

    return messageObject;
}

/**
 * Service class replacing the Mongoose DoubtMessage Model.
 */
class DoubtMessageService {

    /**
     * Finds messages matching the query (replaces Mongoose.find/sort/populate).
     */
    static async find(query = {}, sort = { field: 'createdAt', direction: 'asc' }) {
        let ref = doubtMessagesCollection;
        
        // Apply WHERE clauses (supports threadId)
        if (query.threadId) {
            ref = ref.where('threadId', '==', query.threadId);
        }
        if (query.resolvedAt && query.resolvedAt.$ne === null) {
            ref = ref.where('resolvedAt', '!=', null);
        }

        // Apply sorting
        ref = ref.orderBy(sort.field, sort.direction);

        const snapshot = await ref.get();
        // NOTE: This array contains raw message objects; population must be handled in the route layer.
        return snapshot.docs.map(mapFirestoreDoubtMessage);
    }

    /**
     * Finds one message by its Firestore ID.
     */
    static async findById(id) {
        const doc = await doubtMessagesCollection.doc(id).get();
        return mapFirestoreDoubtMessage(doc);
    }
    
    /**
     * Creates a new DoubtMessage document.
     */
    static async create(data) {
        const docRef = await doubtMessagesCollection.add({
            ...data,
            resolvedAt: data.resolvedAt || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return this.findById(docRef.id);
    }
    
    /**
     * Replaces Mongoose.updateMany for batch updates (used when resolving a thread).
     */
    static async updateMany(query, update) {
         let ref = doubtMessagesCollection;
         let batch = db.batch();
         let count = 0;
         
         // Only supporting update by threadId for resolving
         if (query.threadId) {
            ref = ref.where('threadId', '==', query.threadId);
         } else {
             return { modifiedCount: 0 };
         }

        const docsToUpdate = await ref.get();
        
        docsToUpdate.forEach(doc => {
             // update.$set contains the fields to update (e.g., resolvedAt)
             batch.update(doc.ref, update.$set); 
             count++;
        });
        
        if (count > 0) {
            await batch.commit();
        }
        return { modifiedCount: count };
    }
}

module.exports = DoubtMessageService;