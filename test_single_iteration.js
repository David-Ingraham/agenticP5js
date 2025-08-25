const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import our modules
const GeminiCodeGenerator = require('./lib/geminiCodeGenerator');
const ImageEvaluator = require('./lib/evaluator');
const SketchCapture = require('./lib/capture');

class SingleIterationTest {
    constructor() {
        this.geminiApiKey = process.env.GEMINI_API_KEY;
        this.groqApiKey = process.env.GROQ_API_KEY;
        
        if (!this.geminiApiKey || !this.groqApiKey) {
            throw new Error('Please set GEMINI_API_KEY and GROQ_API_KEY in .env file');
        }
        
        this.codeGenerator = new GeminiCodeGenerator(this.geminiApiKey);
        this.evaluator = new ImageEvaluator(this.groqApiKey);
        this.capture = new SketchCapture();
    }
    
    /**
     * Run a single iteration test
     */
    async runSingleIteration(targetImagePath) {
        console.log('='.repeat(60));
        console.log('SINGLE ITERATION TEST');
        console.log('='.repeat(60));
        
        try {
            // Extract target name for session folder
            const targetName = path.basename(targetImagePath, path.extname(targetImagePath));
            const sessionDir = `sessions/${targetName}_test`;
            
            // Create session directory
            console.log(`Creating session directory: ${sessionDir}`);
            if (!fs.existsSync('sessions')) {
                fs.mkdirSync('sessions');
            }
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir);
            }
            
            // Copy target image to session
            const sessionTargetPath = `${sessionDir}/target.png`;
            fs.copyFileSync(targetImagePath, sessionTargetPath);
            console.log(`Target image copied to: ${sessionTargetPath}`);
            
            // Step 1: Generate initial code
            console.log('\nStep 1: Generating P5.js code...');
            const codeResult = await this.codeGenerator.generateInitialCode(targetImagePath);
            
            // Save generated code
            const codeFilePath = `${sessionDir}/iteration1.html`;
            fs.writeFileSync(codeFilePath, codeResult.code);
            console.log(`Generated code saved to: ${codeFilePath}`);
            
            // Step 2: Start server and capture screenshot
            console.log('\nStep 2: Capturing screenshot...');
            
            // Create a relative URL for the local server
            const relativeCodePath = codeFilePath.replace(/\\/g, '/');
            const sketchUrl = `http://localhost:3000/${relativeCodePath}`;
            
            console.log(`Starting server for: ${sketchUrl}`);
            console.log('Note: Make sure your server.js is running on port 3000');
            console.log('Run: node utils/server.js in another terminal if needed');
            
            // Wait for user to confirm server is running
            console.log('\nPress Enter when server is ready...');
            await this.waitForEnter();
            
            const screenshotPath = `${sessionDir}/iteration1.png`;
            await this.capture.captureSketch(sketchUrl, screenshotPath);
            console.log(`Screenshot saved to: ${screenshotPath}`);
            
            // Step 3: Evaluate similarity
            console.log('\nStep 3: Evaluating similarity...');
            const evaluationResult = await this.evaluator.compareImages(sessionTargetPath, screenshotPath);
            
            // Save evaluation
            const evaluationPath = `${sessionDir}/iteration1_evaluation.json`;
            fs.writeFileSync(evaluationPath, JSON.stringify(evaluationResult, null, 2));
            console.log(`Evaluation saved to: ${evaluationPath}`);
            
            // Display results
            console.log('\n' + '='.repeat(60));
            console.log('ITERATION 1 RESULTS');
            console.log('='.repeat(60));
            console.log(`Score: ${evaluationResult.score}/10`);
            console.log('\nFeedback:');
            console.log(evaluationResult.description);
            console.log('\n' + '='.repeat(60));
            
            // Create session summary
            const summary = {
                targetImage: targetImagePath,
                sessionDir: sessionDir,
                iteration1: {
                    code: codeFilePath,
                    screenshot: screenshotPath,
                    evaluation: evaluationResult,
                    timestamp: new Date().toISOString()
                }
            };
            
            const summaryPath = `${sessionDir}/session_summary.json`;
            fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
            console.log(`Session summary saved to: ${summaryPath}`);
            
            return {
                success: true,
                sessionDir: sessionDir,
                score: evaluationResult.score,
                feedback: evaluationResult.description
            };
            
        } catch (error) {
            console.error('Single iteration test failed:', error);
            return {
                success: false,
                error: error.message
            };
        } finally {
            await this.capture.close();
        }
    }
    
    /**
     * Wait for user input
     */
    waitForEnter() {
        return new Promise((resolve) => {
            process.stdin.once('data', () => {
                resolve();
            });
        });
    }
}

// Run the test
async function runTest() {
    const targetImagePath = 'target_images/sample_target1.png';
    
    if (!fs.existsSync(targetImagePath)) {
        console.error(`Target image not found: ${targetImagePath}`);
        return;
    }
    
    const test = new SingleIterationTest();
    const result = await test.runSingleIteration(targetImagePath);
    
    if (result.success) {
        console.log('\nSingle iteration test completed successfully!');
        console.log(`Session saved in: ${result.sessionDir}`);
    } else {
        console.log('\nTest failed:', result.error);
    }
}

// Run if executed directly
if (require.main === module) {
    runTest();
}

module.exports = SingleIterationTest;
