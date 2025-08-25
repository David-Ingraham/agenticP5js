const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import our modules
const GeminiCodeGenerator = require('./lib/geminiCodeGenerator');
const SimplifiedPixelAnalyzer = require('./lib/simplifiedPixelAnalyzer');
const SketchCapture = require('./lib/capture');
const ErrorDetector = require('./lib/errorDetector');

class PixelFeedbackLoopTest {
    constructor() {
        this.geminiApiKey = process.env.GEMINI_API_KEY;
        
        if (!this.geminiApiKey) {
            throw new Error('Please set GEMINI_API_KEY in .env file');
        }
        
        this.codeGenerator = new GeminiCodeGenerator(this.geminiApiKey);
        this.pixelAnalyzer = new SimplifiedPixelAnalyzer();
        this.capture = new SketchCapture();
        this.errorDetector = new ErrorDetector();
        
        this.maxIterations = 10;
        this.targetScore = 95; // 95/100 target score
        this.maxFixAttempts = 5;
        this.maxFallbacks = 3;
    }
    
    /**
     * Run the pixel-based feedback loop test
     */
    async runPixelFeedbackLoop(targetImagePath) {
        console.log('='.repeat(60));
        console.log('PIXEL-BASED FEEDBACK LOOP TEST');
        console.log('='.repeat(60));
        
        try {
            // Setup session
            const sessionInfo = this.setupSession(targetImagePath);
            console.log(`Session: ${sessionInfo.sessionDir}`);
            console.log(`Target: ${sessionInfo.targetPath}`);
            
            // Get target dimensions and analyze structure
            console.log('\nExtracting target image dimensions...');
            const targetDimensions = await this.pixelAnalyzer.getTargetDimensions(targetImagePath);
            console.log(`Target dimensions: ${targetDimensions.width}x${targetDimensions.height} (aspect ratio: ${targetDimensions.aspectRatio.toFixed(2)})`);
            
            console.log('\nAnalyzing target image structure...');
            const targetStructure = await this.pixelAnalyzer.analyzeTargetStructure(targetImagePath, targetDimensions);
            console.log(`Target has ${targetStructure.regions.length} main regions`);
            
            // Display target structure
            console.log('\nTARGET STRUCTURE:');
            targetStructure.regions.slice(0, 4).forEach((region, index) => {
                console.log(`  ${index + 1}. ${region.color.toUpperCase()}: (${region.bounds.x}, ${region.bounds.y}) ${region.bounds.width}x${region.bounds.height}`);
            });
            
            let previousCode = null;
            let pixelInstructions = null;
            let bestScore = 0;
            let bestIteration = 1;
            let currentIteration = 1;
            let lastWorkingCode = null;
            let fallbackCount = 0;
            
            // Run iterations
            for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
                currentIteration = iteration;
                console.log('\n' + '='.repeat(40));
                console.log(`ITERATION ${iteration} of ${this.maxIterations}`);
                console.log('='.repeat(40));
                
                // Generate code (with fallback logic)
                let codeResult;
                let useCurrentCode = true;
                
                if (iteration === 1) {
                    console.log('Generating initial code...');
                    codeResult = await this.codeGenerator.generateInitialCode(targetImagePath, targetDimensions);
                } else {
                    console.log('Generating improved code based on pixel analysis...');
                    codeResult = await this.codeGenerator.generateImprovedCode(
                        targetImagePath, 
                        previousCode, 
                        pixelInstructions, 
                        iteration,
                        targetDimensions
                    );
                }
                
                // Save initial code
                const codeFilePath = `${sessionInfo.sessionDir}/iteration${iteration}.html`;
                fs.writeFileSync(codeFilePath, codeResult.code);
                console.log(`Code saved: iteration${iteration}.html`);
                
                // Error detection and fixing
                const sketchUrl = `http://localhost:3000/sessions/${sessionInfo.sessionName}/iteration${iteration}.html`;
                let finalCode = codeResult.code;
                let errorFixed = false;
                
                console.log('Checking for JavaScript errors...');
                for (let fixAttempt = 1; fixAttempt <= this.maxFixAttempts; fixAttempt++) {
                    const errorResult = await this.errorDetector.detectErrors(codeFilePath, sketchUrl);
                    
                    if (!errorResult.hasErrors) {
                        console.log('No JavaScript errors detected.');
                        errorFixed = true;
                        lastWorkingCode = finalCode; // Save as working code
                        break;
                    }
                    
                    console.log(`JavaScript errors detected (fix attempt ${fixAttempt}/${this.maxFixAttempts}):`);
                    console.log(this.errorDetector.formatErrors(errorResult));
                    
                    if (fixAttempt === this.maxFixAttempts) {
                        console.log('Max fix attempts reached. Code still has errors.');
                        break;
                    }
                    
                    // Ask Gemini to fix the errors
                    const errorMessage = this.errorDetector.formatErrorsForGemini(errorResult);
                    const fixResult = await this.codeGenerator.fixJavaScriptErrors(finalCode, errorMessage, fixAttempt);
                    finalCode = fixResult.code;
                    
                    // Save fixed code
                    fs.writeFileSync(codeFilePath, finalCode);
                    console.log(`Fixed code saved (attempt ${fixAttempt})`);
                }
                
                // Fallback logic if fixing failed
                if (!errorFixed && lastWorkingCode && fallbackCount < this.maxFallbacks) {
                    fallbackCount++;
                    console.log(`Using fallback to last working code (${fallbackCount}/${this.maxFallbacks})`);
                    finalCode = lastWorkingCode;
                    fs.writeFileSync(codeFilePath, finalCode);
                    errorFixed = true;
                }
                
                // Capture screenshot
                console.log('Capturing screenshot...');
                const screenshotPath = `${sessionInfo.sessionDir}/iteration${iteration}.png`;
                
                await this.capture.captureSketch(sketchUrl, screenshotPath);
                console.log(`Screenshot saved: iteration${iteration}.png`);
                
                // Pixel analysis
                console.log('Performing pixel analysis...');
                const analysis = await this.pixelAnalyzer.compareAndGenerateInstructions(sessionInfo.targetPath, screenshotPath, targetDimensions);
                
                // Save analysis
                const analysisPath = `${sessionInfo.sessionDir}/iteration${iteration}_analysis.json`;
                fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
                
                // Display results
                console.log(`\nPixel-based Score: ${analysis.score}/100`);
                console.log('Precise Instructions for Next Iteration:');
                if (analysis.instructions.length === 0) {
                    console.log('  Perfect! No changes needed.');
                } else {
                    analysis.instructions.forEach((instruction, index) => {
                        console.log(`  ${index + 1}. ${instruction}`);
                    });
                }
                
                // Track best iteration
                if (analysis.score > bestScore) {
                    bestScore = analysis.score;
                    bestIteration = iteration;
                }
                
                // Check if we should stop early
                if (analysis.score >= this.targetScore) {
                    console.log(`\nTARGET SCORE REACHED! (${analysis.score}/100 >= ${this.targetScore})`);
                    console.log(`Stopping early at iteration ${iteration}`);
                    break;
                }
                
                // Prepare pixel-based feedback for next iteration
                previousCode = finalCode; // Use the error-free code
                pixelInstructions = this.formatInstructionsForGemini(analysis.instructions);
                
                // Show progress
                console.log(`\nProgress: Iteration ${iteration} complete`);
                if (iteration < this.maxIterations && analysis.score < this.targetScore) {
                    console.log('Preparing pixel-based feedback for next iteration...');
                }
            }
            
            // Final summary
            console.log('\n' + '='.repeat(60));
            console.log('PIXEL FEEDBACK LOOP COMPLETE');
            console.log('='.repeat(60));
            console.log(`Best Score: ${bestScore}/100 (Iteration ${bestIteration})`);
            console.log(`Target Score: ${this.targetScore}/100`);
            console.log(`Iterations Run: ${currentIteration}`);
            
            if (bestScore >= this.targetScore) {
                console.log('SUCCESS: Target score achieved!');
            } else {
                console.log('PROGRESS: Improvement shown, target not reached');
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
            console.error('Pixel feedback loop test failed:', error);
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
     * Format pixel analysis instructions for Gemini
     */
    formatInstructionsForGemini(instructions) {
        if (instructions.length === 0) {
            return "Perfect! The image matches the target exactly.";
        }
        
        const formattedInstructions = [
            "Based on precise pixel analysis, make these exact changes:",
            "",
            ...instructions.map((instruction, index) => `${index + 1}. ${instruction}`),
            "",
            "Use exact coordinates and sizes as specified. Do not change other elements that are working correctly."
        ].join('\n');
        
        return formattedInstructions;
    }
    
    /**
     * Setup session directory and files
     */
    setupSession(targetImagePath) {
        const targetName = path.basename(targetImagePath, path.extname(targetImagePath));
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const sessionName = `${targetName}_pixel_${timestamp}`;
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
            evaluationMethod: 'simplified_pixel_analysis',
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
            const analysisPath = `${sessionInfo.sessionDir}/iteration${i}_analysis.json`;
            if (fs.existsSync(analysisPath)) {
                const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
                summaryData.iterations.push({
                    iteration: i,
                    score: analysis.score,
                    instructions: analysis.instructions,
                    codeFile: `iteration${i}.html`,
                    screenshotFile: `iteration${i}.png`,
                    analysisFile: `iteration${i}_analysis.json`
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
    
    console.log('Starting pixel-based feedback loop test...');
    console.log('Make sure server is running: node utils/server.js');
    console.log(`Target score: 95/100 (will stop early if reached)`);
    console.log('Using simplified pixel analysis instead of LLM evaluation');
    console.log('');
    
    const test = new PixelFeedbackLoopTest();
    const result = await test.runPixelFeedbackLoop(targetImagePath);
    
    if (result.success) {
        console.log('\nPixel feedback loop test completed!');
        console.log(`Results saved in: ${result.sessionDir}`);
        if (result.targetReached) {
            console.log('Target score achieved!');
        } else {
            console.log(`Best score: ${result.bestScore}/100`);
        }
    } else {
        console.log('\nTest failed:', result.error);
    }
}

// Run if executed directly
if (require.main === module) {
    runTest();
}

module.exports = PixelFeedbackLoopTest;
