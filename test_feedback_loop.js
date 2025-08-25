const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import our modules
const GeminiCodeGenerator = require('./lib/geminiCodeGenerator');
const ImageEvaluator = require('./lib/evaluator');
const SketchCapture = require('./lib/capture');

class FeedbackLoopTest {
    constructor() {
        this.geminiApiKey = process.env.GEMINI_API_KEY;
        this.groqApiKey = process.env.GROQ_API_KEY;
        
        if (!this.geminiApiKey || !this.groqApiKey) {
            throw new Error('Please set GEMINI_API_KEY and GROQ_API_KEY in .env file');
        }
        
        this.codeGenerator = new GeminiCodeGenerator(this.geminiApiKey);
        this.evaluator = new ImageEvaluator(this.groqApiKey);
        this.capture = new SketchCapture();
        
        this.maxIterations = 4;
        this.targetScore = 7.0;
    }
    
    /**
     * Run the complete feedback loop test
     */
    async runFeedbackLoop(targetImagePath) {
        console.log('='.repeat(60));
        console.log('4-ITERATION FEEDBACK LOOP TEST');
        console.log('='.repeat(60));
        
        try {
            // Setup session
            const sessionInfo = this.setupSession(targetImagePath);
            console.log(`Session: ${sessionInfo.sessionDir}`);
            console.log(`Target: ${sessionInfo.targetPath}`);
            
            let previousCode = null;
            let previousFeedback = null;
            let bestScore = 0;
            let bestIteration = 1;
            
            // Run iterations
            for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
                console.log('\n' + '='.repeat(40));
                console.log(`ITERATION ${iteration} of ${this.maxIterations}`);
                console.log('='.repeat(40));
                
                // Generate code
                let codeResult;
                if (iteration === 1) {
                    console.log('Generating initial code...');
                    codeResult = await this.codeGenerator.generateInitialCode(targetImagePath);
                } else {
                    console.log('Generating improved code based on feedback...');
                    codeResult = await this.codeGenerator.generateImprovedCode(
                        targetImagePath, 
                        previousCode, 
                        previousFeedback, 
                        iteration
                    );
                }
                
                // Save code
                const codeFilePath = `${sessionInfo.sessionDir}/iteration${iteration}.html`;
                fs.writeFileSync(codeFilePath, codeResult.code);
                console.log(`Code saved: iteration${iteration}.html`);
                
                // Capture screenshot
                console.log('Capturing screenshot...');
                const screenshotPath = `${sessionInfo.sessionDir}/iteration${iteration}.png`;
                const sketchUrl = `http://localhost:3000/sessions/${sessionInfo.sessionName}/iteration${iteration}.html`;
                
                await this.capture.captureSketch(sketchUrl, screenshotPath);
                console.log(`Screenshot saved: iteration${iteration}.png`);
                
                // Evaluate
                console.log('Evaluating with Groq...');
                const evaluation = await this.evaluator.compareImages(sessionInfo.targetPath, screenshotPath);
                
                // Save evaluation
                const evaluationPath = `${sessionInfo.sessionDir}/iteration${iteration}_evaluation.json`;
                fs.writeFileSync(evaluationPath, JSON.stringify(evaluation, null, 2));
                
                // Display results
                console.log(`\nScore: ${evaluation.score}/10`);
                console.log('Feedback Summary:');
                console.log(evaluation.description.substring(0, 200) + '...');
                
                // Track best iteration
                if (evaluation.score > bestScore) {
                    bestScore = evaluation.score;
                    bestIteration = iteration;
                }
                
                // Check if we should stop early
                if (evaluation.score >= this.targetScore) {
                    console.log(`\n🎉 TARGET SCORE REACHED! (${evaluation.score}/10 >= ${this.targetScore})`);
                    console.log(`Stopping early at iteration ${iteration}`);
                    break;
                }
                
                // Prepare for next iteration
                previousCode = codeResult.code;
                previousFeedback = evaluation.description;
                
                // Show progress
                console.log(`\nProgress: Iteration ${iteration} complete`);
                if (iteration < this.maxIterations && evaluation.score < this.targetScore) {
                    console.log('Preparing feedback for next iteration...');
                }
            }
            
            // Final summary
            console.log('\n' + '='.repeat(60));
            console.log('FEEDBACK LOOP COMPLETE');
            console.log('='.repeat(60));
            console.log(`Best Score: ${bestScore}/10 (Iteration ${bestIteration})`);
            console.log(`Target Score: ${this.targetScore}/10`);
            console.log(`Iterations Run: ${Math.min(iteration, this.maxIterations)}`);
            
            if (bestScore >= this.targetScore) {
                console.log('✅ SUCCESS: Target score achieved!');
            } else {
                console.log('📈 PROGRESS: Improvement shown, target not reached');
            }
            
            // Create final session summary
            const summary = await this.createSessionSummary(sessionInfo, bestScore, bestIteration);
            console.log(`\nSession summary: ${sessionInfo.sessionDir}/session_summary.json`);
            
            return {
                success: true,
                sessionDir: sessionInfo.sessionDir,
                bestScore: bestScore,
                bestIteration: bestIteration,
                targetReached: bestScore >= this.targetScore
            };
            
        } catch (error) {
            console.error('Feedback loop test failed:', error);
            return {
                success: false,
                error: error.message
            };
        } finally {
            await this.capture.close();
        }
    }
    
    /**
     * Setup session directory and files
     */
    setupSession(targetImagePath) {
        const targetName = path.basename(targetImagePath, path.extname(targetImagePath));
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const sessionName = `${targetName}_feedback_${timestamp}`;
        const sessionDir = `sessions/${sessionName}`;
        
        // Create directories
        if (!fs.existsSync('sessions')) {
            fs.mkdirSync('sessions');
        }
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir);
        }
        
        // Copy target image
        const sessionTargetPath = `${sessionDir}/target.png`;
        fs.copyFileSync(targetImagePath, sessionTargetPath);
        
        return {
            sessionDir,
            sessionName,
            targetPath: sessionTargetPath
        };
    }
    
    /**
     * Create comprehensive session summary
     */
    async createSessionSummary(sessionInfo, bestScore, bestIteration) {
        const summaryData = {
            timestamp: new Date().toISOString(),
            sessionDir: sessionInfo.sessionDir,
            targetImage: sessionInfo.targetPath,
            maxIterations: this.maxIterations,
            targetScore: this.targetScore,
            results: {
                bestScore: bestScore,
                bestIteration: bestIteration,
                targetReached: bestScore >= this.targetScore
            },
            iterations: []
        };
        
        // Collect data from each iteration
        for (let i = 1; i <= this.maxIterations; i++) {
            const evaluationPath = `${sessionInfo.sessionDir}/iteration${i}_evaluation.json`;
            if (fs.existsSync(evaluationPath)) {
                const evaluation = JSON.parse(fs.readFileSync(evaluationPath, 'utf8'));
                summaryData.iterations.push({
                    iteration: i,
                    score: evaluation.score,
                    codeFile: `iteration${i}.html`,
                    screenshotFile: `iteration${i}.png`,
                    evaluationFile: `iteration${i}_evaluation.json`
                });
            }
        }
        
        const summaryPath = `${sessionInfo.sessionDir}/session_summary.json`;
        fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2));
        
        return summaryData;
    }
}

// Run the test
async function runTest() {
    const targetImagePath = 'target_images/sample_target1.png';
    
    if (!fs.existsSync(targetImagePath)) {
        console.error(`Target image not found: ${targetImagePath}`);
        return;
    }
    
    console.log('Starting 4-iteration feedback loop test...');
    console.log('Make sure server is running: node utils/server.js');
    console.log('Target score: 7/10 (will stop early if reached)');
    console.log('');
    
    const test = new FeedbackLoopTest();
    const result = await test.runFeedbackLoop(targetImagePath);
    
    if (result.success) {
        console.log('\nFeedback loop test completed!');
        console.log(`Results saved in: ${result.sessionDir}`);
        if (result.targetReached) {
            console.log('🎯 Target score achieved!');
        } else {
            console.log(`📊 Best score: ${result.bestScore}/10`);
        }
    } else {
        console.log('\nTest failed:', result.error);
    }
}

// Run if executed directly
if (require.main === module) {
    runTest();
}

module.exports = FeedbackLoopTest;
