const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import our modules
const GeminiCodeGenerator = require('./lib/geminiCodeGenerator');
const ImageEvaluator = require('./lib/evaluator');
const SketchCapture = require('./lib/capture');
const ErrorDetector = require('./lib/errorDetector');

class UniversalOrchestrator {
    constructor(config = {}) {
        // API Keys
        this.geminiApiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
        this.groqApiKey = config.groqApiKey || process.env.GROQ_API_KEY;
        
        if (!this.geminiApiKey) {
            throw new Error('Please set GEMINI_API_KEY in config or .env file');
        }
        
        // Core components
        this.geminiGenerator = new GeminiCodeGenerator(this.geminiApiKey);
        this.capture = new SketchCapture();
        this.errorDetector = new ErrorDetector();
        
        // Initialize second LLM evaluator only if API key provided and mode requires it
        if (this.groqApiKey && config.evaluationMode === 'dual') {
            this.groqEvaluator = new ImageEvaluator(this.groqApiKey);
        }
        
        // User configurations with defaults
        this.maxIterations = Math.min(Math.max(config.maxIterations || 5, 1), 7); // 1-7 range
        this.targetScore = Math.min(Math.max(config.targetScore || 15, 1), 20);   // 1-20 range
        this.evaluationMode = config.evaluationMode || 'self'; // 'self' | 'dual'
        this.customPrompts = config.customPrompts || {};
        
        // Error handling
        this.maxFixAttempts = 3;
        
        console.log(`Universal Orchestrator initialized:`);
        console.log(`- Evaluation Mode: ${this.evaluationMode}`);
        console.log(`- Max Iterations: ${this.maxIterations}`);
        console.log(`- Target Score: ${this.targetScore}/20`);
    }
    
    /**
     * Run a complete generation session
     */
    async runSession(targetImagePath, progressCallback = null) {
        console.log('='.repeat(60));
        console.log('UNIVERSAL ORCHESTRATOR SESSION');
        console.log('='.repeat(60));
        
        try {
            // Setup session
            const sessionInfo = this.setupSession(targetImagePath);
            console.log(`Session: ${sessionInfo.sessionDir}`);
            console.log(`Target: ${sessionInfo.targetPath}`);
            console.log(`Mode: ${this.evaluationMode.toUpperCase()}`);
            
            // Get target dimensions using sharp directly
            const sharp = require('sharp');
            const metadata = await sharp(targetImagePath).metadata();
            const targetDimensions = {
                width: metadata.width,
                height: metadata.height,
                aspectRatio: metadata.width / metadata.height
            };
            console.log(`Target dimensions: ${targetDimensions.width}x${targetDimensions.height}`);
            
            // Session state
            let previousCode = null;
            let previousFeedback = null;
            let bestScore = 0;
            let bestIteration = 1;
            let bestCode = null;
            let currentIteration = 1;
            
            // Run iterations
            for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
                currentIteration = iteration;
                console.log('\n' + '='.repeat(40));
                console.log(`ITERATION ${iteration} of ${this.maxIterations}`);
                console.log('='.repeat(40));
                
                // Report progress
                if (progressCallback) {
                    progressCallback({
                        iteration,
                        maxIterations: this.maxIterations,
                        status: 'generating_code',
                        bestScore,
                        targetScore: this.targetScore
                    });
                }
                
                // Generate code
                const codeResult = await this.generateCode(
                    targetImagePath, 
                    previousCode, 
                    previousFeedback, 
                    iteration, 
                    targetDimensions
                );
                
                // Save code
                const codeFilePath = `${sessionInfo.sessionDir}/iteration${iteration}.html`;
                fs.writeFileSync(codeFilePath, codeResult.code);
                console.log(`Code saved: iteration${iteration}.html`);
                
                // Error detection and fixing
                const finalCode = await this.handleErrors(codeResult.code, iteration, sessionInfo);
                if (finalCode !== codeResult.code) {
                    fs.writeFileSync(codeFilePath, finalCode);
                    console.log(`Fixed code saved: iteration${iteration}.html`);
                }
                
                // Capture screenshot
                if (progressCallback) {
                    progressCallback({
                        iteration,
                        status: 'capturing_screenshot',
                        bestScore,
                        targetScore: this.targetScore
                    });
                }
                
                const screenshotPath = await this.captureScreenshot(finalCode, iteration, sessionInfo);
                
                // Evaluate iteration
                if (progressCallback) {
                    progressCallback({
                        iteration,
                        status: 'evaluating',
                        bestScore,
                        targetScore: this.targetScore
                    });
                }
                
                const evaluation = await this.evaluateIteration(
                    sessionInfo.targetPath, 
                    screenshotPath, 
                    finalCode, 
                    iteration
                );
                
                // Save evaluation
                const evaluationPath = `${sessionInfo.sessionDir}/iteration${iteration}_evaluation.json`;
                fs.writeFileSync(evaluationPath, JSON.stringify(evaluation, null, 2));
                
                // Display results
                console.log(`\nScore: ${evaluation.score}/20`);
                console.log('Feedback Summary:');
                console.log(evaluation.feedback.substring(0, 200) + '...');
                
                // Track best iteration
                if (evaluation.score > bestScore) {
                    bestScore = evaluation.score;
                    bestIteration = iteration;
                    bestCode = finalCode;
                    console.log(`NEW BEST SCORE: ${bestScore}/20 (iteration ${iteration})`);
                }
                
                // Report progress
                if (progressCallback) {
                    progressCallback({
                        iteration,
                        status: 'completed',
                        score: evaluation.score,
                        bestScore,
                        targetScore: this.targetScore,
                        feedback: evaluation.feedback
                    });
                }
                
                // Check stopping condition
                if (evaluation.score >= this.targetScore) {
                    console.log(`\nTARGET SCORE REACHED! (${evaluation.score}/20 >= ${this.targetScore}/20)`);
                    console.log(`Stopping early at iteration ${iteration}`);
                    break;
                }
                
                // Prepare for next iteration
                previousCode = finalCode;
                previousFeedback = evaluation.feedback;
                
                // Show progress
                console.log(`Progress: ${iteration}/${this.maxIterations} iterations, Best: ${bestScore}/20, Target: ${this.targetScore}/20`);
            }
            
            // Create session summary
            const summary = await this.createSessionSummary(sessionInfo, bestScore, bestIteration, currentIteration);
            
            console.log('\n' + '='.repeat(60));
            console.log('SESSION COMPLETE');
            console.log('='.repeat(60));
            console.log(`Best Score: ${bestScore}/20 (iteration ${bestIteration})`);
            console.log(`Total Iterations: ${currentIteration}`);
            console.log(`Evaluation Mode: ${this.evaluationMode}`);
            console.log(`Session saved: ${sessionInfo.sessionDir}`);
            
            return {
                sessionInfo,
                bestScore,
                bestIteration,
                totalIterations: currentIteration,
                targetReached: bestScore >= this.targetScore,
                summary
            };
            
        } catch (error) {
            console.error('Session failed:', error);
            throw error;
        }
    }
    
    /**
     * Generate code based on iteration and previous feedback
     */
    async generateCode(targetImagePath, previousCode, previousFeedback, iteration, targetDimensions) {
        if (iteration === 1) {
            console.log('Generating initial code...');
            return await this.geminiGenerator.generateInitialCode(targetImagePath, targetDimensions);
        } else {
            console.log(`Generating improved code (iteration ${iteration})...`);
            return await this.geminiGenerator.generateImprovedCode(
                targetImagePath, 
                previousCode, 
                previousFeedback, 
                iteration,
                targetDimensions
            );
        }
    }
    
    /**
     * Capture screenshot with error handling
     */
    async captureScreenshot(code, iteration, sessionInfo) {
        console.log('Capturing screenshot...');
        const screenshotPath = `${sessionInfo.sessionDir}/iteration${iteration}.png`;
        const sketchUrl = `http://localhost:3000/sessions/${sessionInfo.sessionName}/iteration${iteration}.html`;
        
        await this.capture.captureSketch(sketchUrl, screenshotPath);
        console.log(`Screenshot saved: iteration${iteration}.png`);
        
        return screenshotPath;
    }
    
    /**
     * Evaluate iteration based on configured mode
     */
    async evaluateIteration(targetImagePath, screenshotPath, code, iteration) {
        if (this.evaluationMode === 'self') {
            // Gemini self-evaluation
            console.log('Evaluating with Gemini self-assessment...');
            const result = await this.geminiGenerator.compareImagesAndImprove(
                targetImagePath, 
                screenshotPath, 
                code, 
                iteration
            );
            
            // Convert to expected format (score + feedback)
            return {
                score: result.success ? 10 : 0, // Simple score based on success
                feedback: result.analysis || result.error || 'No feedback available',
                timestamp: new Date().toISOString(),
                evaluationMethod: 'gemini_self'
            };
        } else if (this.evaluationMode === 'dual') {
            // Second LLM evaluation
            if (!this.groqEvaluator) {
                throw new Error('Groq evaluator not initialized. Please provide GROQ_API_KEY for dual mode.');
            }
            console.log('Evaluating with Groq LLM...');
            const groqResult = await this.groqEvaluator.compareImages(targetImagePath, screenshotPath);
            
            // Convert Groq's 0-10 scale to 0-20 scale for consistency
            return {
                score: Math.round(groqResult.score * 2), // 0-10 -> 0-20
                feedback: groqResult.description,
                timestamp: groqResult.timestamp,
                evaluationMethod: 'groq_llm'
            };
        } else {
            throw new Error(`Unknown evaluation mode: ${this.evaluationMode}`);
        }
    }
    
    /**
     * Handle JavaScript errors with retry logic
     */
    async handleErrors(code, iteration, sessionInfo) {
        const sketchUrl = `http://localhost:3000/sessions/${sessionInfo.sessionName}/iteration${iteration}.html`;
        let finalCode = code;
        
        console.log('Checking for JavaScript errors...');
        for (let fixAttempt = 1; fixAttempt <= this.maxFixAttempts; fixAttempt++) {
            const errorResult = await this.errorDetector.detectErrors(
                `${sessionInfo.sessionDir}/iteration${iteration}.html`, 
                sketchUrl
            );
            
            if (!errorResult.hasErrors && errorResult.canvasExists) {
                console.log('No errors detected - code is working correctly');
                break;
            }
            
            if (fixAttempt === this.maxFixAttempts) {
                console.log(`Max fix attempts reached (${this.maxFixAttempts}). Using current code.`);
                break;
            }
            
            console.log(`Attempt ${fixAttempt}: Fixing JavaScript errors...`);
            const fixResult = await this.geminiGenerator.fixJavaScriptErrors(finalCode, errorResult);
            
            if (fixResult && fixResult.code && fixResult.code !== finalCode) {
                finalCode = fixResult.code;
                fs.writeFileSync(`${sessionInfo.sessionDir}/iteration${iteration}.html`, finalCode);
                console.log(`Fixed code attempt ${fixAttempt}`);
            } else {
                console.log(`No code changes in fix attempt ${fixAttempt}`);
                break;
            }
        }
        
        return finalCode;
    }
    
    /**
     * Setup session directory structure
     */
    setupSession(targetImagePath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const targetName = path.basename(targetImagePath, path.extname(targetImagePath));
        const sessionName = `${targetName}_universal_${timestamp}`;
        const sessionDir = `sessions/${sessionName}`;
        
        // Create session directory
        if (!fs.existsSync('sessions')) {
            fs.mkdirSync('sessions');
        }
        fs.mkdirSync(sessionDir);
        
        // Copy target image to session
        const sessionTargetPath = `${sessionDir}/target.png`;
        fs.copyFileSync(targetImagePath, sessionTargetPath);
        
        return {
            sessionName,
            sessionDir,
            targetPath: sessionTargetPath
        };
    }
    
    /**
     * Create comprehensive session summary
     */
    async createSessionSummary(sessionInfo, bestScore, bestIteration, totalIterations) {
        const summaryData = {
            timestamp: new Date().toISOString(),
            sessionDir: sessionInfo.sessionDir,
            targetImage: sessionInfo.targetPath,
            evaluationMethod: this.evaluationMode,
            maxIterations: this.maxIterations,
            targetScore: this.targetScore,
            results: {
                bestScore: bestScore,
                bestIteration: bestIteration,
                totalIterations: totalIterations,
                targetReached: bestScore >= this.targetScore
            },
            config: {
                evaluationMode: this.evaluationMode,
                maxIterations: this.maxIterations,
                targetScore: this.targetScore,
                customPrompts: this.customPrompts
            },
            iterations: []
        };
        
        // Collect data from each iteration
        for (let i = 1; i <= totalIterations; i++) {
            const evaluationPath = `${sessionInfo.sessionDir}/iteration${i}_evaluation.json`;
            const codeFile = `${sessionInfo.sessionDir}/iteration${i}.html`;
            const screenshotFile = `${sessionInfo.sessionDir}/iteration${i}.png`;
            
            if (fs.existsSync(codeFile)) {
                const iterationData = {
                    iteration: i,
                    codeFile: `iteration${i}.html`,
                    screenshotFile: `iteration${i}.png`
                };
                
                if (fs.existsSync(evaluationPath)) {
                    const evaluation = JSON.parse(fs.readFileSync(evaluationPath, 'utf8'));
                    iterationData.score = evaluation.score;
                    iterationData.evaluationFile = `iteration${i}_evaluation.json`;
                }
                
                summaryData.iterations.push(iterationData);
            }
        }
        
        const summaryPath = `${sessionInfo.sessionDir}/session_summary.json`;
        fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2));
        
        return summaryData;
    }
}

module.exports = UniversalOrchestrator;

// Test function
async function runTest() {
    const config = {
        maxIterations: 5,
        targetScore: 15,
        evaluationMode: 'dual', // or 'self'
        customPrompts: {}
    };
    
    const orchestrator = new UniversalOrchestrator(config);
    const targetImagePath = 'target_images/sample_target1.png';
    
    try {
        const result = await orchestrator.runSession(targetImagePath, (progress) => {
            console.log(`Progress: Iteration ${progress.iteration}, Status: ${progress.status}`);
        });
        
        console.log('Test completed successfully!');
        console.log(`Best score: ${result.bestScore}/20`);
        console.log(`Target reached: ${result.targetReached}`);
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run test if this file is executed directly
if (require.main === module) {
    runTest();
}
