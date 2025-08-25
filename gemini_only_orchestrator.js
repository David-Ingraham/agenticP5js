const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import our modules
const GeminiCodeGenerator = require('./lib/geminiCodeGenerator');
const SketchCapture = require('./lib/capture');
const ErrorDetector = require('./lib/errorDetector');

class GeminiOnlyOrchestrator {
    constructor() {
        this.geminiApiKey = process.env.GEMINI_API_KEY;
        
        if (!this.geminiApiKey) {
            throw new Error('Please set GEMINI_API_KEY in .env file');
        }
        
        this.codeGenerator = new GeminiCodeGenerator(this.geminiApiKey);
        this.capture = new SketchCapture();
        this.errorDetector = new ErrorDetector();
        
        this.maxIterations = 10;
        // Remove scoring - focus on iterative improvement
        this.maxFixAttempts = 3; // Reduced since Gemini handles improvement better
    }
    
    /**
     * Run the Gemini-only visual feedback loop
     */
    async runGeminiLoop(targetImagePath) {
        console.log('='.repeat(60));
        console.log('GEMINI-ONLY VISUAL FEEDBACK LOOP');
        console.log('='.repeat(60));
        
        try {
            // Setup session
            const sessionInfo = this.setupSession(targetImagePath);
            console.log(`Session: ${sessionInfo.sessionDir}`);
            console.log(`Target: ${sessionInfo.targetPath}`);
            
            // Get target dimensions
            console.log('\nExtracting target image dimensions...');
            const sharp = require('sharp');
            const metadata = await sharp(targetImagePath).metadata();
            const targetDimensions = {
                width: metadata.width,
                height: metadata.height,
                aspectRatio: metadata.width / metadata.height
            };
            console.log(`Target dimensions: ${targetDimensions.width}x${targetDimensions.height} (aspect ratio: ${targetDimensions.aspectRatio.toFixed(2)})`);
            
            let bestIteration = 1;
            let currentCode = null;
            let iterationHistory = []; // Track previous iterations
            
            // Run iterations
            for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
                console.log('\n' + '='.repeat(40));
                console.log(`ITERATION ${iteration} of ${this.maxIterations}`);
                console.log('='.repeat(40));
                
                let codeResult;
                
                if (iteration === 1) {
                    // Generate initial code
                    console.log('Gemini generating initial code...');
                    try {
                        const initialResult = await this.codeGenerator.generateInitialCode(targetImagePath, targetDimensions);
                        codeResult = { success: true, code: initialResult.code };
                    } catch (error) {
                        console.log(`Initial code generation failed: ${error.message}`);
                        codeResult = { success: false, error: error.message };
                    }
                } else {
                    // Visual comparison and improvement
                    console.log('Gemini comparing images visually...');
                    const previousScreenshot = `${sessionInfo.sessionDir}/iteration${iteration-1}.png`;
                    
                    const visualAnalysis = await this.codeGenerator.compareImagesAndImprove(
                        sessionInfo.targetPath,
                        previousScreenshot,
                        currentCode,
                        iteration,
                        targetDimensions,
                        iterationHistory
                    );
                    
                    if (!visualAnalysis.success) {
                        console.log(`Visual analysis failed: ${visualAnalysis.error}`);
                        // Fallback to previous code
                        codeResult = { success: true, code: currentCode };
                    } else {
                        console.log('Gemini analysis:');
                        console.log(visualAnalysis.analysis.substring(0, 300) + '...');
                        
                        // Save analysis
                        const analysisPath = `${sessionInfo.sessionDir}/iteration${iteration}_analysis.json`;
                        fs.writeFileSync(analysisPath, JSON.stringify(visualAnalysis, null, 2));
                        
                        // Generate improved code
                        console.log('Gemini generating improved code...');
                        codeResult = await this.codeGenerator.generateImprovedCodeFromVisualAnalysis(
                            sessionInfo.targetPath,
                            currentCode,
                            visualAnalysis,
                            iteration,
                            targetDimensions
                        );
                        
                        // Add to iteration history
                        iterationHistory.push({
                            iteration: iteration - 1, // Previous iteration number
                            feedback: visualAnalysis.analysis.substring(0, 200) + '...',
                            instructions: visualAnalysis.instructions
                        });
                        
                        // Keep only last 3 iterations to avoid overwhelming the prompt
                        if (iterationHistory.length > 3) {
                            iterationHistory.shift();
                        }
                    }
                }
                
                if (!codeResult.success) {
                    console.log(`Code generation failed: ${codeResult.error}`);
                    continue;
                }
                
                // Save code
                const codeFilePath = `${sessionInfo.sessionDir}/iteration${iteration}.html`;
                fs.writeFileSync(codeFilePath, codeResult.code);
                console.log(`Code saved: iteration${iteration}.html`);
                
                // Error detection and fixing
                const sketchUrl = `http://localhost:3000/sessions/${sessionInfo.sessionName}/iteration${iteration}.html`;
                let finalCode = codeResult.code;
                
                console.log('Checking for JavaScript errors...');
                for (let fixAttempt = 1; fixAttempt <= this.maxFixAttempts; fixAttempt++) {
                    const errorResult = await this.errorDetector.detectErrors(codeFilePath, sketchUrl);
                    
                    if (!errorResult.hasErrors) {
                        console.log('No JavaScript errors detected.');
                        break;
                    }
                    
                    console.log(`JavaScript errors detected (fix attempt ${fixAttempt}/${this.maxFixAttempts}):`);
                    console.log(this.errorDetector.formatErrors(errorResult));
                    
                    if (fixAttempt === this.maxFixAttempts) {
                        console.log('Max fix attempts reached. Code may still have errors.');
                        break;
                    }
                    
                    // Ask Gemini to fix the errors
                    const errorMessage = this.errorDetector.formatErrorsForGemini(errorResult);
                    const fixResult = await this.codeGenerator.fixJavaScriptErrors(finalCode, errorMessage, fixAttempt);
                    
                    if (fixResult.success) {
                        finalCode = fixResult.code;
                        fs.writeFileSync(codeFilePath, finalCode);
                        console.log(`Fixed code saved (attempt ${fixAttempt})`);
                    }
                }
                
                // Update current code
                currentCode = finalCode;
                
                // Capture screenshot
                console.log('Capturing screenshot...');
                const screenshotPath = `${sessionInfo.sessionDir}/iteration${iteration}.png`;
                
                await this.capture.captureSketch(sketchUrl, screenshotPath);
                console.log(`Screenshot saved: iteration${iteration}.png`);
                
                console.log(`\nProgress: Iteration ${iteration} complete`);
            }
            
            // Final summary
            console.log('\n' + '='.repeat(60));
            console.log('GEMINI VISUAL FEEDBACK LOOP COMPLETE');
            console.log('='.repeat(60));
            console.log(`Final Iteration: ${bestIteration}`);
            console.log(`Total Iterations Run: ${this.maxIterations}`);
            console.log('COMPLETED: Visual iterative improvement process finished');
            
            // Create final session summary
            const summary = await this.createSessionSummary(sessionInfo, bestIteration);
            console.log(`\nSession summary: ${sessionInfo.sessionDir}/session_summary.json`);
            
            return {
                success: true,
                sessionDir: sessionInfo.sessionDir,
                bestIteration: bestIteration,
                totalIterations: this.maxIterations
            };
            
        } catch (error) {
            console.error('Gemini feedback loop failed:', error);
            return {
                success: false,
                error: error.message
            };
        } finally {
            await this.capture.close();
            await this.errorDetector.close();
        }
    }
    
    /**
     * Setup session directory and files
     */
    setupSession(targetImagePath) {
        const targetName = path.basename(targetImagePath, path.extname(targetImagePath));
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const sessionName = `${targetName}_gemini_${timestamp}`;
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
    async createSessionSummary(sessionInfo, bestIteration) {
        const summaryData = {
            timestamp: new Date().toISOString(),
            sessionDir: sessionInfo.sessionDir,
            targetImage: sessionInfo.targetPath,
            evaluationMethod: 'gemini_visual_comparison_no_scoring',
            maxIterations: this.maxIterations,
            results: {
                bestIteration: bestIteration,
                totalIterations: this.maxIterations,
                completionMethod: 'iterative_improvement'
            },
            iterations: []
        };
        
        // Collect data from each iteration
        for (let i = 1; i <= this.maxIterations; i++) {
            const analysisPath = `${sessionInfo.sessionDir}/iteration${i}_analysis.json`;
            const codeFile = `${sessionInfo.sessionDir}/iteration${i}.html`;
            const screenshotFile = `${sessionInfo.sessionDir}/iteration${i}.png`;
            
            if (fs.existsSync(codeFile)) {
                const iterationData = {
                    iteration: i,
                    codeFile: `iteration${i}.html`,
                    screenshotFile: `iteration${i}.png`
                };
                
                if (fs.existsSync(analysisPath)) {
                    iterationData.analysisFile = `iteration${i}_analysis.json`;
                }
                
                summaryData.iterations.push(iterationData);
            }
        }
        
        const summaryPath = `${sessionInfo.sessionDir}/session_summary.json`;
        fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2));
        
        return summaryData;
    }
}

// Run the test
async function runTest() {
    const targetImagePath = 'target_images/kandinsky1.png';
    
    if (!fs.existsSync(targetImagePath)) {
        console.error(`Target image not found: ${targetImagePath}`);
        return;
    }
    
    console.log('Starting Gemini-only visual feedback loop...');
    console.log('Make sure server is running: node utils/server.js');
    console.log('No scoring - focus on iterative visual improvement');
    console.log('Using Gemini for visual comparison and self-improvement');
    console.log('');
    
    const orchestrator = new GeminiOnlyOrchestrator();
    const result = await orchestrator.runGeminiLoop(targetImagePath);
    
    if (result.success) {
        console.log('\nGemini visual feedback loop completed!');
        console.log(`Results saved in: ${result.sessionDir}`);
        console.log(`Completed ${result.totalIterations} iterations of visual improvement`);
    } else {
        console.log('\nTest failed:', result.error);
    }
}

// Run if executed directly
if (require.main === module) {
    runTest();
}

module.exports = GeminiOnlyOrchestrator;
