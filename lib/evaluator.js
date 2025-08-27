const fs = require('fs');
const path = require('path');
require('dotenv').config();

class ImageEvaluator {
    constructor(groqApiKey) {
        this.groqApiKey = groqApiKey;
        this.groqBaseUrl = 'https://api.groq.com/openai/v1';
    }
    
    /**
     * Convert image file to base64 for API
     */
    imageToBase64(imagePath) {
        try {
            const imageBuffer = fs.readFileSync(imagePath);
            const base64String = imageBuffer.toString('base64');
            const mimeType = this.getMimeType(imagePath);
            return `data:${mimeType};base64,${base64String}`;
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
     * Compare two images using Groq's LLaVA model
     */
    async compareImages(targetImagePath, generatedImagePath, customPrompt = '') {
        try {
            console.log(`Reading target image: ${targetImagePath}`);
            const targetImage = this.imageToBase64(targetImagePath);
            console.log(`Reading generated image: ${generatedImagePath}`);
            const generatedImage = this.imageToBase64(generatedImagePath);
            
            console.log('Images loaded successfully, sending to Groq API...');
            
            const response = await fetch(`${this.groqBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.groqApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: customPrompt || `Compare these images and provide:

1. A similarity score from 0-10 (where 10 is identical)

2. List each difference between the two images:
   - Use simple language: 'add X', 'remove Y', 'change Z to W'
   - Focus on the most important differences only
   -Be consice but still detailed`
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: targetImage
                                    }
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: generatedImage
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.1
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Groq API Error Details:', errorText);
                throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errorText}`);
            }
            
            const result = await response.json();
            const evaluation = result.choices[0].message.content;
            
            // Extract numerical score from the evaluation
            const scoreMatch = evaluation.match(/(?:score|similarity)[:\s]*([0-9](?:\.[0-9])?)/i);
            const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
            
            return {
                score: score,
                description: evaluation,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('Error in image comparison:', error);
            throw error;
        }
    }
}

// Test function
async function testEvaluation() {
    // Read GROQ_API_KEY from .env file
    const groqApiKey = process.env.GROQ_API_KEY;
    
    if (!groqApiKey) {
        console.error('Please set GROQ_API_KEY in .env file');
        console.error('Create a .env file with: GROQ_API_KEY=your_key_here');
        return;
    }
    
    const evaluator = new ImageEvaluator(groqApiKey);
    
    try {
        // Test with your existing screenshot
        const targetPath = 'target_images/sample_target.png'; // We'll need to add this
        const generatedPath = 'screenshots/test-sketch-2025-08-25T14-37-16-991Z.png';
        
        console.log('Testing image evaluation...');
        const result = await evaluator.compareImages(targetPath, generatedPath);
        
        console.log('Evaluation Result:');
        console.log(`Score: ${result.score}/10`);
        console.log(`Description: ${result.description}`);
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

module.exports = ImageEvaluator;

// Run test if this file is executed directly
if (require.main === module) {
    testEvaluation();
}
