// functions/models/DoubtThread.js - Firestore DoubtThread Service
const admin = require('firebase-admin');
const { getCollection, db } = require('../config/firestore'); 

const DOUBT_THREADS_COLLECTION = 'doubtThreads';
const doubtThreadsCollection = getCollection(DOUBT_THREADS_COLLECTION);

/**
 * Maps a Firestore DoubtThread document to a standardized object.
 * @param {admin.firestore.DocumentSnapshot} doc 
 */
function mapFirestoreDoubtThread(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    
    const threadObject = { 
        _id: doc.id,
        userId: data.userId, 
        mentorId: data.mentorId || null,
        subject: data.subject,
        topicId: data.topicId,
        initialQuestion: data.initialQuestion,
        status: data.status,
        resolvedAt: data.resolvedAt ? data.resolvedAt.toDate() : null,
        createdAt: data.createdAt ? data.createdAt.toDate() : undefined,
        updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
    };

    // Add save method (for updates like status or mentorId assignment)
    threadObject.save = async function() {
        const updateData = { 
            userId: this.userId,
            mentorId: this.mentorId,
            subject: this.subject,
            topicId: this.topicId,
            initialQuestion: this.initialQuestion,
            status: this.status,
            resolvedAt: this.resolvedAt || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await doubtThreadsCollection.doc(this._id).update(updateData);
        return threadObject;
    };

    return threadObject;
}

/**
 * Service class replacing the Mongoose DoubtThread Model.
 */
class DoubtThreadService {

    /**
     * Finds threads matching the query (replaces Mongoose.find).
     */
    static async find(query = {}, sort = { field: 'updatedAt', direction: 'desc' }) {
        let ref = doubtThreadsCollection;
        
        // Apply WHERE clauses (supports userId, mentorId, and status $in)
        if (query.userId) ref = ref.where('userId', '==', query.userId);
        if (query.mentorId) ref = ref.where('mentorId', '==', query.mentorId);
        if (query.status && query.status.$in) {
             ref = ref.where('status', 'in', query.status.$in);
        } else if (query.status) {
             ref = ref.where('status', '==', query.status);
        }

        // Apply sorting
        ref = ref.orderBy(sort.field, sort.direction);

        const snapshot = await ref.get();
        return snapshot.docs.map(mapFirestoreDoubtThread);
    }

    /**
     * Finds one thread by its Firestore ID.
     */
    static async findById(id) {
        const doc = await doubtThreadsCollection.doc(id).get();
        return mapFirestoreDoubtThread(doc);
    }
    
    /**
     * Finds one thread by query fields (replaces Mongoose.findOne).
     */
    static async findOne(query) {
         let ref = doubtThreadsCollection;
         if (query._id) ref = ref.where(admin.firestore.FieldPath.documentId(), '==', query._id);
         if (query.userId) ref = ref.where('userId', '==', query.userId);
         if (query.mentorId) ref = ref.where('mentorId', '==', query.mentorId);
         
        const snapshot = await ref.limit(1).get();
        if (snapshot.empty) return null;
        return mapFirestoreDoubtThread(snapshot.docs[0]);
    }

    /**
     * Creates a new DoubtThread document.
     */
    static async create(data) {
        const docRef = await doubtThreadsCollection.add({
            ...data,
            status: data.status || 'new',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return this.findById(docRef.id);
    }
    
    /**
     * Replaces findOneAndUpdate with Mongoose syntax (for resolving status).
     */
    static async findOneAndUpdate(query, update) {
         let docToUpdate = await this.findOne(query);

         if (docToUpdate) {
             // Apply updates from $set
             if (update.$set) {
                 Object.assign(docToUpdate, update.$set);
             }
             // Save using the document's save method
             await docToUpdate.save();
             return docToUpdate;
         }
         return null;
    }
}

module.exports = DoubtThreadService;