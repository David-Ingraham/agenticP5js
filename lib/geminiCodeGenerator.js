import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

class GeminiP5CodeGenerator {
    constructor(geminiApiKey) {
        this.geminiApiKey = geminiApiKey;
        this.geminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    }
    
    /**
     * Convert image file to base64 for Gemini API
     */
    imageToBase64(imagePath) {
        try {
            const imageBuffer = fs.readFileSync(imagePath);
            const base64String = imageBuffer.toString('base64');
            const mimeType = this.getMimeType(imagePath);
            return {
                inlineData: {
                    mimeType: mimeType,
                    data: base64String
                }
            };
        } catch (error) {
            throw new Error(`Failed to read image: ${error.message}`);
        }
    }
    
    /**
     * Get MIME type based on file extension
     */
    getMimeType(imagePath) {
        const ext = path.extname(imagePath).toLowerCase();
        const mimeTypes = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };
        return mimeTypes[ext] || 'image/png';
    }
    
    /**
     * Extract HTML code from Gemini's response (removes markdown and explanations)
     */
    extractHTMLFromResponse(rawResponse) {
        // Look for HTML code between ```html and ``` or ```
        const htmlMatch = rawResponse.match(/```html\s*([\s\S]*?)```/i) || 
                         rawResponse.match(/```\s*(<!DOCTYPE[\s\S]*?)```/i);
        
        if (htmlMatch && htmlMatch[1]) {
            return htmlMatch[1].trim();
        }
        
        // If no markdown backticks, check if it's already clean HTML
        if (rawResponse.trim().startsWith('<!DOCTYPE') || rawResponse.trim().startsWith('<html')) {
            return rawResponse.trim();
        }
        
        // Last resort: return as-is and hope for the best
        console.warn('Could not extract HTML from response, using raw response');
        return rawResponse;
    }
    
    /**
     * Generate initial P5.js code from target image
     */
    async generateInitialCode(targetImagePath, targetDimensions = null, customPrompt = '') {
        try {
            console.log(`Generating initial code for: ${targetImagePath}`);
            
            const imageContent = this.imageToBase64(targetImagePath);
            const imageSize = fs.statSync(targetImagePath).size;
            console.log(`Image size: ${imageSize} bytes`);
            
            // Get target dimensions if not provided
            if (!targetDimensions) {
                const sharp = (await import('sharp')).default;
                const metadata = await sharp(targetImagePath).metadata();
                targetDimensions = {
                    width: metadata.width,
                    height: metadata.height,
                    aspectRatio: metadata.width / metadata.height
                };
            }
            
            console.log(`Target dimensions: ${targetDimensions.width}x${targetDimensions.height}`);
            
            const response = await fetch(`${this.geminiBaseUrl}/models/gemini-1.5-pro:generateContent?key=${this.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: customPrompt || `You are tasked with recreating this target image using P5.js code. You will have 7 attempts total. After each attempt, you'll receive evaluation feedback to improve the next iteration.

Create a complete HTML file with embedded P5.js that recreates this image focusing on accurate colors, shapes, and composition.

TARGET IMAGE DIMENSIONS: ${targetDimensions.width}x${targetDimensions.height}

CRITICAL P5.js REQUIREMENTS:
- Canvas size must EXACTLY match target: createCanvas(${targetDimensions.width}, ${targetDimensions.height})
- Use hex colors ONLY: '#FFCC00', '#FF0000', etc. (NO color() function)
- Do NOT define variables outside functions
-Use Cutsom loopin mechanims, objects and functions to accomodate the complexity of the target image
- All drawing code must be inside the draw() function
- Use noLoop() for static images
- Test that your code runs without JavaScript errors

TEMPLATE:
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.jsdelivr.net/npm/p5@1.4.0/lib/p5.js"></script>
</head>
<body>
<script>
function setup() {
    createCanvas(${targetDimensions.width}, ${targetDimensions.height});
    noLoop();
}
function draw() {
    // All drawing code here using fill('#HEXCOLOR')
    // Coordinates must fit within ${targetDimensions.width}x${targetDimensions.height} canvas
}
</script>
</body>
</html>

Respond with ONLY the complete HTML code. No explanations.

This is attempt 1 of 7.`
                            },
                            imageContent
                        ]
                    }]
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API Error Details:', errorText);
                throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
            }
            
            const result = await response.json();
            const rawResponse = result.candidates[0].content.parts[0].text;
            const generatedCode = this.extractHTMLFromResponse(rawResponse);
            
            return {
                code: generatedCode,
                attempt: 1,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('Error generating initial code:', error);
            throw error;
        }
    }
    
    /**
     * Generate improved P5.js code based on evaluation feedback
     */
    async generateImprovedCode(targetImagePath, previousCode, evaluationFeedback, attemptNumber, targetDimensions = null, customPrompt = '') {
        try {
            console.log(`Generating improved code - attempt ${attemptNumber} of 7`);
            
            const imageContent = this.imageToBase64(targetImagePath);
            
            // Get target dimensions if not provided
            if (!targetDimensions) {
                const sharp = (await import('sharp')).default;
                const metadata = await sharp(targetImagePath).metadata();
                targetDimensions = {
                    width: metadata.width,
                    height: metadata.height,
                    aspectRatio: metadata.width / metadata.height
                };
            }
            
            const response = await fetch(`${this.geminiBaseUrl}/models/gemini-1.5-pro:generateContent?key=${this.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `You are recreating this target image using P5.js code. This is attempt ${attemptNumber} of 7.

Your previous code was:
\`\`\`html
${previousCode}
\`\`\`

Here is the evaluation feedback from your previous attempt:
${evaluationFeedback}

CRITICAL: Fix any JavaScript errors in your previous code:
- Canvas size must EXACTLY match target: createCanvas(${targetDimensions.width}, ${targetDimensions.height})
- Use hex colors ONLY: '#FFCC00', '#FF0000', etc. (NO color() function)
- Do NOT define variables outside functions
- All drawing code must be inside the draw() function
- Coordinates must fit within ${targetDimensions.width}x${targetDimensions.height} canvas
- Ensure the code runs without JavaScript errors

Improve the code based on this feedback and fix any JavaScript errors.
Respond with ONLY the complete HTML code.`
                            },
                            imageContent
                        ]
                    }]
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API Error Details:', errorText);
                throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
            }
            
            const result = await response.json();
            const rawResponse = result.candidates[0].content.parts[0].text;
            const generatedCode = this.extractHTMLFromResponse(rawResponse);
            
            return {
                code: generatedCode,
                attempt: attemptNumber,
                timestamp: new Date().toISOString(),
                basedOnFeedback: evaluationFeedback
            };
            
        } catch (error) {
            console.error('Error generating improved code:', error);
            throw error;
        }
    }
    
    /**
     * Compare target and generated images visually and provide improvement instructions
     */
    async compareImagesAndImprove(targetImagePath, generatedImagePath, previousCode, attemptNumber, targetDimensions = null, iterationHistory = []) {
        try {
            console.log(`Gemini visual comparison - attempt ${attemptNumber} of 10`);
            
            const targetImageContent = this.imageToBase64(targetImagePath);
            const generatedImageContent = this.imageToBase64(generatedImagePath);
            
            // Get target dimensions if not provided
            if (!targetDimensions) {
                const sharp = (await import('sharp')).default;
                const metadata = await sharp(targetImagePath).metadata();
                targetDimensions = {
                    width: metadata.width,
                    height: metadata.height,
                    aspectRatio: metadata.width / metadata.height
                };
            }
            
            const response = await fetch(`${this.geminiBaseUrl}/models/gemini-1.5-pro:generateContent?key=${this.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `You are an expert P5.js developer recreating this target image. 

Compare these two images:
1. TARGET IMAGE (what you need to recreate)
2. GENERATED IMAGE (your current attempt ${attemptNumber})

${iterationHistory.length > 0 ? `
PREVIOUS ITERATION HISTORY:
${iterationHistory.map(hist => `
Iteration ${hist.iteration}:
Previous feedback: ${hist.feedback}
Previous changes attempted: ${hist.instructions.join(', ')}
`).join('')}

IMPORTANT: You've tried the above approaches before. Try a DIFFERENT approach or be more specific with measurements.
` : ''}

Analyze the differences and provide:

1. **Key Differences**: List 3-4 specific visual differences (colors, positions, shapes, sizes)
2. **Improvement Instructions**: Provide clear, actionable P5.js code changes with SPECIFIC pixel values

TARGET CANVAS SIZE: ${targetDimensions.width}x${targetDimensions.height}

Focus on:
- Exact color matching using hex values
- Precise positioning and sizing (use specific pixel coordinates)
- Correct shapes and composition
- Missing or extra elements
${iterationHistory.length > 2 ? '- Try a COMPLETELY DIFFERENT approach if previous attempts failed' : ''}

CURRENT CODE ATTEMPT ${attemptNumber}:
\`\`\`html
${previousCode}
\`\`\`

Provide your analysis in this format:
**Differences:**
1. [specific difference with exact measurements]
2. [specific difference with exact measurements]
3. [specific difference with exact measurements]

**Instructions:**
- [specific P5.js change with exact pixel values]
- [specific P5.js change with exact pixel values]
- [specific P5.js change with exact pixel values]`
                            },
                            targetImageContent,
                            generatedImageContent
                        ]
                    }]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid response format from Gemini API');
            }

            const analysisText = data.candidates[0].content.parts[0].text;
            
            return {
                success: true,
                analysis: analysisText,
                instructions: this.extractInstructionsFromAnalysis(analysisText)
            };

        } catch (error) {
            console.error('Error in visual comparison:', error);
            return {
                success: false,
                error: error.message,
                analysis: '',
                instructions: []
            };
        }
    }
    
    /**
     * Extract actionable instructions from Gemini's analysis
     */
    extractInstructionsFromAnalysis(analysisText) {
        const lines = analysisText.split('\n');
        const instructions = [];
        let inInstructionsSection = false;
        
        for (const line of lines) {
            if (line.includes('**Instructions:**') || line.includes('Instructions:')) {
                inInstructionsSection = true;
                continue;
            }
            
            if (inInstructionsSection && line.trim().startsWith('-')) {
                instructions.push(line.trim().substring(1).trim());
            }
        }
        
        return instructions;
    }
    
    /**
     * Generate improved code based on Gemini's visual analysis
     */
    async generateImprovedCodeFromVisualAnalysis(targetImagePath, previousCode, visualAnalysis, attemptNumber, targetDimensions = null) {
        try {
            console.log(`Generating improved code from visual analysis - attempt ${attemptNumber} of 10`);
            
            const targetImageContent = this.imageToBase64(targetImagePath);
            
            // Get target dimensions if not provided
            if (!targetDimensions) {
                const sharp = (await import('sharp')).default;
                const metadata = await sharp(targetImagePath).metadata();
                targetDimensions = {
                    width: metadata.width,
                    height: metadata.height,
                    aspectRatio: metadata.width / metadata.height
                };
            }
            
            const response = await fetch(`${this.geminiBaseUrl}/models/gemini-1.5-pro:generateContent?key=${this.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `You are improving your P5.js code based on your own visual analysis.

TARGET IMAGE to recreate:

PREVIOUS CODE (attempt ${attemptNumber}):
\`\`\`html
${previousCode}
\`\`\`

YOUR VISUAL ANALYSIS:
${visualAnalysis.analysis}

IMPROVEMENT INSTRUCTIONS:
${visualAnalysis.instructions.map((inst, i) => `${i+1}. ${inst}`).join('\n')}

Create an improved version that addresses the differences you identified.

CRITICAL REQUIREMENTS:
- Canvas size: createCanvas(${targetDimensions.width}, ${targetDimensions.height})
- Use hex colors ONLY: '#FFCC00', '#FF0000', etc.
- All drawing code inside draw() function
-At least 300 lines of code 
- Use noLoop() for static images
- Test coordinates fit within ${targetDimensions.width}x${targetDimensions.height}

TEMPLATE:
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.jsdelivr.net/npm/p5@1.4.0/lib/p5.js"></script>
</head>
<body>
<script>
function setup() {
    createCanvas(${targetDimensions.width}, ${targetDimensions.height});
    noLoop();
}
function draw() {
    // Improved drawing code here
}
</script>
</body>
</html>

Respond with ONLY the complete HTML code. No explanations.

This is attempt ${attemptNumber} of 10.`
                            },
                            targetImageContent
                        ]
                    }]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid response format from Gemini API');
            }

            const rawCode = data.candidates[0].content.parts[0].text;
            const cleanCode = this.extractHTMLFromResponse(rawCode);

            return {
                success: true,
                code: cleanCode
            };

        } catch (error) {
            console.error('Error generating improved code from visual analysis:', error);
            return {
                success: false,
                error: error.message,
                code: previousCode // Fallback to previous code
            };
        }
    }

    /**
     * Fix JavaScript errors in generated code
     */
    async fixJavaScriptErrors(brokenCode, errorMessage, attemptNumber) {
        try {
            console.log(`Attempting to fix JavaScript errors - fix attempt ${attemptNumber}/5`);
            
            const response = await fetch(`${this.geminiBaseUrl}/models/gemini-1.5-pro:generateContent?key=${this.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `You are an expert at fixing P5.js JavaScript errors. 

BROKEN CODE:
\`\`\`html
${brokenCode}
\`\`\`

ERRORS TO FIX:
${errorMessage}

INSTRUCTIONS:
- Fix ONLY the JavaScript errors listed above
- Keep the exact same visual intent and drawing commands
- Use hex colors like '#FFCC00' instead of color() function
- Do not define variables outside functions
- Ensure all drawing code is inside the draw() function
- Test that setup() and draw() functions exist

Respond with ONLY the corrected HTML code. No explanations.`
                        }]
                    }]
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API Error Details:', errorText);
                throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
            }
            
            const result = await response.json();
            const rawResponse = result.candidates[0].content.parts[0].text;
            const fixedCode = this.extractHTMLFromResponse(rawResponse);
            
            return {
                code: fixedCode,
                attempt: attemptNumber,
                timestamp: new Date().toISOString(),
                fixedErrors: errorMessage
            };
            
        } catch (error) {
            console.error('Error fixing JavaScript errors:', error);
            throw error;
        }
    }
}

// Test function
async function testGeminiCodeGeneration() {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    if (!geminiApiKey) {
        console.error('Please set GEMINI_API_KEY in .env file');
        return;
    }
    
    const generator = new GeminiP5CodeGenerator(geminiApiKey);
    
    try {
        const targetPath = 'target_images/sample_target.png';
        
        console.log('Testing Gemini code generation...');
        const result = await generator.generateInitialCode(targetPath);
        
        console.log('Generated Code:');
        console.log('='.repeat(50));
        console.log(result.code);
        console.log('='.repeat(50));
        
        // Save test output
        if (!fs.existsSync('test_output')) {
            fs.mkdirSync('test_output');
        }
        
        const outputPath = `test_output/gemini_generation_${Date.now()}.html`;
        fs.writeFileSync(outputPath, result.code);
        console.log(`Code saved to: ${outputPath}`);
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

export default GeminiP5CodeGenerator;


