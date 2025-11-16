// functions/models/Question.js - Firestore Question Service
const admin = require('firebase-admin');
const { getCollection, db } = require('../config/firestore'); 

const QUESTIONS_COLLECTION = 'questions';
const questionsCollection = getCollection(QUESTIONS_COLLECTION);

/**
 * Maps a Firestore Question document to a standardized object.
 * @param {admin.firestore.DocumentSnapshot} doc 
 */
function mapFirestoreQuestion(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    
    const questionObject = { 
        _id: doc.id,
        questionType: data.questionType || 'mcq',
        text: data.text,
        options: data.options || [],
        correctAnswerIndex: data.correctAnswerIndex,
        shortAnswers: data.shortAnswers || [],
        timeLimit: data.timeLimit,
        createdBy: data.createdBy,
        createdAt: data.createdAt ? data.createdAt.toDate() : undefined,
        updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
    };

    // Add save method (for updates like edit)
    questionObject.save = async function() {
        // Re-run validation logic (optional, but safer)
        QuestionService.validateQuestion(this);

        const updateData = { 
            questionType: this.questionType,
            text: this.text,
            options: this.options,
            correctAnswerIndex: this.correctAnswerIndex,
            shortAnswers: this.shortAnswers,
            timeLimit: this.timeLimit,
            createdBy: this.createdBy,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await questionsCollection.doc(this._id).update(updateData);
        return questionObject;
    };

    return questionObject;
}

/**
 * Service class replacing the Mongoose Question Model.
 */
class QuestionService {

    /**
     * Replicates the Mongoose pre-save validation hook logic.
     */
    static validateQuestion(data) {
        if (!data.text || !data.timeLimit || data.timeLimit < 10) {
            throw { name: 'ValidationError', message: 'Question text and a time limit (min 10s) are required.' };
        }

        if (data.questionType === 'mcq') {
            if (!data.options || data.options.length < 2) {
                throw { name: 'ValidationError', message: 'MCQ questions must have at least 2 options.' };
            }
            if (data.correctAnswerIndex === null || data.correctAnswerIndex === undefined || data.correctAnswerIndex < 0) {
                throw { name: 'ValidationError', message: 'MCQ questions must have a valid correctAnswerIndex.' };
            }
            if (data.correctAnswerIndex >= data.options.length) {
                 throw { name: 'ValidationError', message: 'correctAnswerIndex is out of bounds for the given options.' };
            }
        } else if (data.questionType === 'short_answer') {
            if (!data.shortAnswers || data.shortAnswers.length === 0) {
                throw { name: 'ValidationError', message: 'Short Answer questions must have at least one acceptable answer.' };
            }
        }
    }
    
    /**
     * Finds a question by its Firestore ID (replaces findById).
     */
    static async findById(id) {
        const doc = await questionsCollection.doc(id).get();
        return mapFirestoreQuestion(doc);
    }
    
    /**
     * Creates a new Question document (replaces new Question() and .save()).
     */
    static async create(data) {
        // 1. Run validation before saving
        this.validateQuestion(data);

        const questionData = {
            ...data,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        // Clean up fields based on type before saving to maintain clean Firestore structure
        if (questionData.questionType === 'mcq') {
             delete questionData.shortAnswers;
        } else if (questionData.questionType === 'short_answer') {
             delete questionData.options;
             delete questionData.correctAnswerIndex;
        }

        const docRef = await questionsCollection.add(questionData);
        return this.findById(docRef.id);
    }
    
    /**
     * Updates a question by its ID (replaces findByIdAndUpdate, used in PUT route).
     */
    static async findByIdAndUpdate(id, updateData) {
        // 1. Fetch current data to re-run validation properly
        const currentQuestion = await this.findById(id);
        if (!currentQuestion) return null;

        // 2. Apply updates and merge (must apply temporary fields for validation check)
        const mergedData = { ...currentQuestion, ...updateData };

        // 3. Re-run validation on merged data
        this.validateQuestion(mergedData);

        // 4. Clean up and set timestamp
        if (mergedData.questionType === 'mcq') {
             delete mergedData.shortAnswers;
        } else if (mergedData.questionType === 'short_answer') {
             delete mergedData.options;
             delete mergedData.correctAnswerIndex;
        }
        
        const dataToUpdate = {
            ...mergedData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        // Remove properties generated by mapping before update
        delete dataToUpdate._id;
        delete dataToUpdate.save;
        
        await questionsCollection.doc(id).update(dataToUpdate);
        return this.findById(id);
    }
    
    /**
     * Deletes a question by its Firestore ID.
     */
    static async delete(id) {
        const question = await this.findById(id);
        if (question) {
            await questionsCollection.doc(id).delete();
            return question;
        }
        return null;
    }
}

module.exports = QuestionService;