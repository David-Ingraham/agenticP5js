const fs = require('fs');
const path = require('path');
require('dotenv').config();

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
    async generateInitialCode(targetImagePath) {
        try {
            console.log(`Generating initial code for: ${targetImagePath}`);
            
            const imageContent = this.imageToBase64(targetImagePath);
            const imageSize = fs.statSync(targetImagePath).size;
            console.log(`Image size: ${imageSize} bytes`);
            
            const response = await fetch(`${this.geminiBaseUrl}/models/gemini-1.5-flash:generateContent?key=${this.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `You are tasked with recreating this target image using P5.js code. You will have 7 attempts total. After each attempt, you'll receive evaluation feedback to improve the next iteration.

Create a complete HTML file with embedded P5.js (400x400 canvas) that recreates this image focusing on accurate colors, shapes, and composition.

Requirements:
- Canvas size must be exactly 400x400 pixels
- Use embedded P5.js (CDN link is fine)
- Focus on visual accuracy: colors, shapes, proportions
- Make it a static image (noLoop() is recommended)
- Include basic HTML structure
-bi extar text in your output besides the html and embedded p5.js code

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
    async generateImprovedCode(targetImagePath, previousCode, evaluationFeedback, attemptNumber) {
        try {
            console.log(`Generating improved code - attempt ${attemptNumber} of 7`);
            
            const imageContent = this.imageToBase64(targetImagePath);
            
            const response = await fetch(`${this.geminiBaseUrl}/models/gemini-1.5-flash:generateContent?key=${this.geminiApiKey}`, {
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

Please improve the code based on this feedback. Focus on:
- Addressing specific issues mentioned in the evaluation
- Improving visual accuracy: colors, shapes, composition
- Maintaining 400x400 canvas size
- Creating a complete HTML file with embedded P5.js

Generate the improved complete HTML file.`
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

module.exports = GeminiP5CodeGenerator;

// Run test if this file is executed directly
if (require.main === module) {
    testGeminiCodeGeneration();
}
