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

    async runTest(imageInput) {
        try {
            let imageBase64, imageUrl = null;
            
            // Check if input is a URL or file path
            if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
                // It's a URL - fetch the image and also store the URL
                console.log('Testing with image URL:', imageInput);
                imageUrl = imageInput;
                
                const response = await fetch(imageInput);
                if (!response.ok) {
                    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                imageBase64 = buffer.toString('base64');
            } else {
                // It's a local file path
                console.log('Testing with local image:', imageInput);
                const imageBuffer = fs.readFileSync(imageInput);
                imageBase64 = imageBuffer.toString('base64');
            }
            
            // Create prompt based on whether we have a URL
            const promptText = imageUrl 
                ? `This is an image that may be algorithmically generated, a photograph, or digital art. You have access to a reverse_image_lookup tool that can search for similar images online. The image is available at this URL: ${imageUrl}. Please analyze the image and use the reverse image lookup tool if you think it would help identify the creation technique or find similar examples.`
                : `This is an image that may be algorithmically generated, a photograph, or digital art. You have access to a reverse_image_lookup tool, but this image is only available locally (no public URL), so you cannot use the tool for this image. Please analyze what you can see in the image and describe how it might have been created.`;
            
            // Ask Gemini to analyze the image
            const result = await this.model.generateContent([
                {
                    text: promptText
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
            console.log('Function calls detected:', functionCalls.length);
            
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

// You can test with either a local file or a URL:
// const imageInput = 'target_images/test5.png';  // Local file
const imageInput = 'https://raw.githubusercontent.com/processing/p5.js-website/main/src/assets/learn/color/hsb-wheel.png';  // Direct image URL

// If using local file, check if it exists
if (!imageInput.startsWith('http') && !fs.existsSync(imageInput)) {
    console.error('Target image not found:', imageInput);
    console.log('Please add the image file or use a public URL');
    process.exit(1);
}

test.runTest(imageInput); 