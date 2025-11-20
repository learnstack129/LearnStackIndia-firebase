// functions/models/Test.js - Firestore Test Service
const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');
const { getCollection, db } = require('../config/firestore'); 

const TESTS_COLLECTION = 'tests';
const testsCollection = getCollection(TESTS_COLLECTION);

/**
 * Maps a Firestore Test document to a standardized object.
 * @param {admin.firestore.DocumentSnapshot} doc 
 */
function mapFirestoreTest(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    
    const testObject = { 
        _id: doc.id,
        title: data.title,
        createdBy: data.createdBy,
        password: data.password, // Hashed password
        questions: data.questions || [], // Array of Question IDs
        isActive: data.isActive === undefined ? false : data.isActive,
        createdAt: data.createdAt ? data.createdAt.toDate() : undefined,
        updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
        // NOTE: 'questions' property will be populated in the route layer
    };

    // Add check password method (replaces Mongoose instance method)
    testObject.correctPassword = async function(candidatePassword) {
        if (!this.password) return false;
        return bcrypt.compare(candidatePassword, this.password);
    };
    
    // Add save method (for updates like toggle or adding questions)
    testObject.save = async function() {
        const updateData = { 
            title: this.title,
            createdBy: this.createdBy,
            password: this.password,
            questions: this.questions,
            isActive: this.isActive,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await testsCollection.doc(this._id).update(updateData);
        return testObject;
    };

    return testObject;
}

/**
 * Service class replacing the Mongoose Test Model.
 */
class TestService {

    /**
     * Finds tests matching the query (replaces Mongoose.find).
     */
    static async find(query = {}, sort = { field: 'createdAt', direction: 'desc' }) {
        let ref = testsCollection;
        
        if (query.createdBy) ref = ref.where('createdBy', '==', query.createdBy);
        if (query.isActive !== undefined) ref = ref.where('isActive', '==', query.isActive);

        // Apply sorting
        ref = ref.orderBy(sort.field, sort.direction);

        const snapshot = await ref.get();
        return snapshot.docs.map(mapFirestoreTest);
    }

    /**
     * Finds one test by its Firestore ID (replaces findById).
     */
    static async findById(id) {
        const doc = await testsCollection.doc(id).get();
        return mapFirestoreTest(doc);
    }
    
    /**
     * Creates a new Test document (replaces new Test() and .save()).
     */
    static async create(data) {
        // Validation check (basic required fields)
        if (!data.title || !data.password || !data.createdBy) {
            throw { name: 'ValidationError', message: 'Title, password, and createdBy are required.' };
        }
        
        // Hashing password
        const hashedPassword = await bcrypt.hash(data.password, 12);

        const testData = {
            ...data,
            password: hashedPassword,
            questions: data.questions || [],
            isActive: data.isActive === undefined ? false : data.isActive,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await testsCollection.add(testData);
        return this.findById(docRef.id);
    }
    
    /**
     * Deletes a test by its Firestore ID.
     */
    static async delete(id) {
        const test = await this.findById(id);
        if (test) {
            await testsCollection.doc(id).delete();
            return test;
        }
        return null;
    }
    
}

module.exports = TestService;