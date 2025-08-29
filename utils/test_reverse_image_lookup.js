import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

class SimpleImageTest {
    constructor() {
        // Check for required API keys
        if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not found in .env');
        if (!process.env.SERP_API_KEY) throw new Error('SERP_API_KEY not found in .env');
        
        // Initialize Gemini
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ 
            model: "gemini-1.5-pro",
            tools: [{
                function_declarations: [{
                    name: "reverse_image_lookup",
                    description: "Search for similar images and find potential source algorithms",
                    parameters: {
                        type: "object",
                        properties: {
                            image_url: {
                                type: "string",
                                description: "URL of the image to search for"
                            }
                        },
                        required: ["image_url"]
                    }
                }]
            }]
        });
    }

    async searchImage(imageUrl) {
        // Call SerpAPI for reverse image search
        const searchUrl = `https://serpapi.com/search.json?engine=google_lens&url=${encodeURIComponent(imageUrl)}&api_key=${process.env.SERP_API_KEY}`;
        
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        return data;
    }

    async runTest(imagePath) {
        try {
            // Load the image
            const imageBuffer = fs.readFileSync(imagePath);
            const imageBase64 = imageBuffer.toString('base64');
            
            console.log('Testing with image:', imagePath);
            
            // Ask Gemini to analyze the image and decide if it wants to search
            const result = await this.model.generateContent([
                {
                    text: " Please analyze this image and use the reverse image lookup tool to find more info on the image. it may be algormithcally generated image, a real photo graph, or a painting. What can you tell me about how this image was created?"
                },
                {
                    inlineData: {
                        mimeType: "image/png",
                        data: imageBase64
                    }
                }
            ]);

            const response = await result.response;
            console.log('\nGemini initial analysis:');
            console.log(response.text());
            
            // If Gemini called the tool, handle the results
            const functionCalls = response.functionCalls || [];
            if (functionCalls && functionCalls.length > 0) {
                console.log('\nGemini decided to use reverse image search...');
                
                for (const call of functionCalls) {
                    if (call.name === 'reverse_image_lookup') {
                        const { image_url } = call.args;
                        console.log('Searching for:', image_url);
                        
                        const searchResults = await this.searchImage(image_url);
                        console.log('\nSearch results:', JSON.stringify(searchResults, null, 2));
                        
                        // Let Gemini analyze the results
                        const followUp = await this.model.generateContent([
                            {
                                text: "Based on these search results, can you identify the algorithms or techniques used in the original image?"
                            },
                            {
                                functionResponse: {
                                    name: 'reverse_image_lookup',
                                    response: searchResults
                                }
                            }
                        ]);
                        
                        const followUpResponse = await followUp.response;
                        console.log('\nGemini analysis of search results:');
                        console.log(followUpResponse.text());
                    }
                }
            }
        } catch (error) {
            console.error('Test failed:', error);
        }
    }
}

// Run the test if called directly
const test = new SimpleImageTest();
const targetImagePath = 'target_images/test5.png';

if (!fs.existsSync(targetImagePath)) {
    console.error('Target image not found:', targetImagePath);
    console.log('Please add perlin_noise.png to the target_images folder');
    process.exit(1);
}

test.runTest(targetImagePath); 