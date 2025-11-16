// functions/routes/dailyProblem.js - MODIFIED to use Services

const express = require('express');
const axios = require('axios');
const router = express.Router();
const auth = require('../middleware/auth');
const UserService = require('../models/User'); // <-- Use UserService
const DailyProblemService = require('../models/DailyProblem'); // <-- Use DailyProblemService
// 🚨 TEMPORARY: Topic is still Mongoose for now.
const Topic = require('../models/Topic'); 
const { checkSubjectAccess } = require('../utils/accessControl');

// --- OneCompiler API Config (Uses process.env) ---
const oneCompilerAxios = axios.create({
    baseURL: 'https://onecompiler-apis.p.rapidapi.com/api/v1/run',
    headers: {
        'X-RapidAPI-Host': 'onecompiler-apis.p.rapidapi.com',
        'X-RapidAPI-Key': process.env.ONECOMPILER_API_KEY, 
        'Content-Type': 'application/json'
    }
});

// 1. GET: Fetch the active daily problem for a subject
router.get('/active/:subjectName', auth, async (req, res) => {
    try {
        const subjectName = req.params.subjectName;
        const userId = req.user.id;

        const hasAccess = await checkSubjectAccess(userId, subjectName);
        if (!hasAccess) {
            return res.json({ success: true, problem: null }); 
        }
        
        // CHANGE: Use DailyProblemService.findOne
        const problem = await DailyProblemService.findOne({
            subject: subjectName,
            isActive: true
        });

        res.json({ success: true, problem: problem || null });
    } catch (error) {
        console.error('Error fetching active daily problem:', error);
        res.status(500).json({ message: 'Error fetching daily problem' });
    }
});

// 2. GET: Fetch details of a specific problem
router.get('/details/:problemId', auth, async (req, res) => {
    try {
        // CHANGE: Use DailyProblemService.findById
        const problem = await DailyProblemService.findById(req.params.problemId);

        if (!problem) {
            return res.status(404).json({ message: 'Problem not found.' });
        }
        
        const hasAccess = await checkSubjectAccess(req.user.id, problem.subject);
        if (!hasAccess) {
            return res.status(403).json({ message: 'Access denied. You must unlock this subject to view its daily problems.' });
        }
        
        // CHANGE: Use UserService.findById
        let user = await UserService.findById(req.user.id);
        const attempt = user.dailyProblemAttempts.find(a => a.problemId === problem._id);

        let solutionCode = null;
        if (attempt && attempt.isLocked && !attempt.passed) {
            solutionCode = problem.solutionCode; 
        }
        if (attempt && attempt.passed) {
             solutionCode = problem.solutionCode; 
        }
        
        const problemData = { ...problem };
        if (solutionCode) {
            problemData.solutionCode = solutionCode;
        } else {
            delete problemData.solutionCode; 
        }

        res.json({ success: true, problem: problemData });
    } catch (error) {
        console.error('Error fetching problem details:', error);
        res.status(500).json({ message: 'Error fetching problem details' });
    }
});

// 3. GET: Fetch the user's attempt status for a problem
router.get('/my-attempt/:problemId', auth, async (req, res) => {
    try {
        // CHANGE: Use UserService.findById
        const user = await UserService.findById(req.user.id);
        // Find attempt by the Firestore ID (string)
        const attempt = user.dailyProblemAttempts.find(a => a.problemId === req.params.problemId);

        if (!attempt) {
            return res.json({
                success: true,
                attempt: {
                    runCount: 0,
                    isLocked: false,
                    passed: false,
                    mentorFeedback: null
                }
            });
        }
        res.json({ success: true, attempt });
    } catch (error) {
        console.error('Error fetching user attempt:', error);
        res.status(500).json({ message: 'Error fetching user attempt' });
    }
});

// 4. POST: Submit code (Synchronous Flow)
router.post('/submit', auth, async (req, res) => {
    try {
        const { problemId, submittedCode } = req.body;
        // CHANGE: Use DailyProblemService.findById
        let user = await UserService.findById(req.user.id);
        const problem = await DailyProblemService.findById(problemId);

        if (!user || !problem) {
            return res.status(404).json({ message: 'User or problem not found.' });
        }

        const hasAccess = await checkSubjectAccess(req.user.id, problem.subject);
        if (!hasAccess) {
            return res.status(403).json({ message: 'Access denied. You must unlock this subject to submit answers.' });
        }

        // CHANGE: Use user.findOrCreateDailyAttempt (now a UserService method)
        // Pass problem._id (Firestore string ID)
        const attempt = user.findOrCreateDailyAttempt(problem._id);

        if (attempt.isLocked) return res.status(403).json({ message: 'You have no more attempts for this problem.' });
        if (attempt.passed) return res.status(403).json({ message: 'You have already solved this problem.' });

        if (attempt.runCount >= 2) {
            attempt.isLocked = true;
            await UserService.update(user.id, user);
            return res.status(403).json({ message: 'Run limit (2) exceeded. Problem is now locked.' });
        }

        // --- Execute Code for each test case (OneCompiler logic remains) ---
        let passedCount = 0;
        let resultsString = "";
        let executionError = null;
        
        let fileName;
        switch (problem.language.toLowerCase()) {
            case 'c': fileName = 'main.c'; break;
            case 'cpp': fileName = 'main.cpp'; break;
            case 'python': fileName = 'main.py'; break;
            case 'java': fileName = 'Main.java'; break;
            case 'javascript': default: fileName = 'index.js';
        }

        for (const [index, testCase] of problem.testCases.entries()) {
            try {
                // Call the external API
                const response = await oneCompilerAxios.post('', {
                    language: problem.language,
                    stdin: testCase.input || "",
                    files: [{ name: fileName, content: submittedCode }]
                });

                if (response.data.exception || response.data.stderr) {
                    let errorMsg = response.data.exception || response.data.stderr;
                    executionError = `Test Case ${index + 1} Error: ${errorMsg}`;
                    resultsString += `${executionError}\n`;
                    break; 
                }
                
                const output = (response.data.stdout || "").trim();
                const expected = (testCase.expectedOutput || "").trim();

                if (output === expected) {
                    passedCount++;
                    resultsString += `Test Case ${index + 1}: Passed\n`;
                } else {
                    resultsString += `Test Case ${index + 1}: Failed\n  Expected: "${expected}"\n  Got: "${output}"\n`;
                    break; 
                }

            } catch (apiError) {
                console.error("OneCompiler API Error:", apiError.response ? apiError.response.data : apiError.message);
                executionError = "Error connecting to code execution service.";
                resultsString = executionError;
                break; 
            }
        }
        // --- End Test Case Loop ---

        // --- Update User Attempt ---
        attempt.runCount += 1; 
        
        if (executionError) {
            attempt.lastResults = resultsString; 
        } else {
            attempt.lastResults = `[${passedCount} / ${problem.testCases.length} Test Cases Passed]\n\n${resultsString}`;
        }
        
        attempt.lastSubmittedCode = submittedCode;
        attempt.passed = (!executionError && passedCount === problem.testCases.length);

        // Check 3: Award Points (on first-ever run)
        if (attempt.runCount === 1 && !attempt.pointsAwarded) {
            // Update points and set flag (handled by UserService)
            user.stats.rank.points = (user.stats.rank.points || 0) + problem.pointsForAttempt;
            attempt.pointsAwarded = true;
        }
        
        let solutionCode = null;

        // Check 4: Lock Logic
        if (attempt.passed) {
            attempt.isLocked = true;
            solutionCode = problem.solutionCode; 
        } else if (attempt.runCount >= 2) {
            attempt.isLocked = true;
            solutionCode = problem.solutionCode; 
        }
        
        await UserService.update(user.id, user); // Final save
        
        // Return the final state
        res.json({
            success: true,
            finalState: {
                passed: attempt.passed,
                isLocked: attempt.isLocked,
                runCount: attempt.runCount,
                lastResults: attempt.lastResults,
                solutionCode: solutionCode 
            }
        });

    } catch (error) {
        console.error('Error in /submit:', error.message);
        res.status(500).json({ message: error.message || 'Error running code.' });
    }
});


module.exports = router;