// functions/models/SubjectMeta.js - Firestore SubjectMeta Service
const admin = require('firebase-admin');
const { getCollection } = require('../config/firestore'); 

const SUBJECT_META_COLLECTION = 'subjectMeta';
const subjectMetaCollection = getCollection(SUBJECT_META_COLLECTION);

/**
 * Maps a Firestore SubjectMeta document to a standardized JavaScript object.
 * @param {admin.firestore.DocumentSnapshot} doc 
 */
function mapFirestoreSubjectMeta(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    
    const metaObject = { 
        _id: doc.id, // Keep _id for consistency
        name: data.name, 
        icon: data.icon || 'book',
        color: data.color || 'gray',
        createdAt: data.createdAt ? data.createdAt.toDate() : undefined,
        updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
    };
    return metaObject;
}

/**
 * Service class replacing the Mongoose SubjectMeta Model.
 */
class SubjectMetaService {

    /**
     * Finds all subject metadata (replaces Mongoose.find/lean).
     */
    static async find() {
        const snapshot = await subjectMetaCollection.get();
        return snapshot.docs.map(mapFirestoreSubjectMeta);
    }
    
    /**
     * Creates or Updates a document by 'name' (replaces Mongoose.findOneAndUpdate with upsert).
     */
    static async findOneAndUpdate(query, updateData, options) {
        if (!query.name) throw new Error('Query must contain name for SubjectMeta update.');
        
        const snapshot = await subjectMetaCollection.where('name', '==', query.name).limit(1).get();
        const dataToUpdate = {
            ...updateData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (snapshot.empty && options.upsert) {
            // Create New
            const newDocRef = subjectMetaCollection.doc();
            await newDocRef.set({ ...dataToUpdate, name: query.name, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            return this.findById(newDocRef.id);
        } else if (!snapshot.empty) {
            // Update Existing
            await snapshot.docs[0].ref.update(dataToUpdate);
            return this.findById(snapshot.docs[0].id);
        }
        return null;
    }

    /**
     * Finds a subject by its Firestore ID.
     */
    static async findById(id) {
        const doc = await subjectMetaCollection.doc(id).get();
        return mapFirestoreSubjectMeta(doc);
    }
}

// Export the service class
module.exports = SubjectMetaService;