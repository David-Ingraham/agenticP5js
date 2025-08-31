import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

class WebSearchTest {
    constructor() {
        // Check for required API key
        if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not found in .env');
        
        // Initialize Gemini with web search tool
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        const toolConfig = {
            function_declarations: [{
                name: "web_search",
                description: "Search the web for information about algorithms, techniques, or tutorials",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "Search terms to look up based off what you think the image is so you can best recreate it. Photograph, painting, generative art, etc."
                        }
                    },
                    required: ["query"]
                }
            }]
        };
        
        console.log('Tool configuration:', JSON.stringify(toolConfig, null, 2));
        
        this.model = this.genAI.getGenerativeModel({ 
            model: "gemini-1.5-pro",
            tools: [toolConfig]
        });
    }

    async performWebSearch(query) {
        console.log('Searching the web for:', query);
        
        if (!process.env.SERP_API_KEY) {
            console.log('No SERP_API_KEY found - using fallback');
            return this.fallbackSearch(query);
        }
        
        try {
            // Real SerpAPI search
            const searchUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${process.env.SERP_API_KEY}&num=5`;
            
            const response = await fetch(searchUrl);
            const data = await response.json();
            
            if (data.organic_results) {
                const results = data.organic_results.map(result => ({
                    title: result.title,
                    url: result.link,
                    snippet: result.snippet || 'No description available'
                }));
                
                return {
                    query: query,
                    results: results.slice(0, 3),
                    total_results: results.length
                };
            } else {
                console.log('No organic results found, using fallback');
                return this.fallbackSearch(query);
            }
        } catch (error) {
            console.log('Search API failed, using fallback:', error.message);
            return this.fallbackSearch(query);
        }
    }
    
    fallbackSearch(query) {
        // Minimal fallback for when API is not available
        return {
            query: query,
            results: [
                {
                    title: "p5.js Reference",
                    url: "https://p5js.org/reference/",
                    snippet: "Complete reference documentation for p5.js functions and methods."
                },
                {
                    title: "The Coding Train",
                    url: "https://thecodingtrain.com/",
                    snippet: "Video tutorials on creative coding, algorithms, and p5.js techniques."
                },
                {
                    title: "OpenProcessing",
                    url: "https://openprocessing.org/",
                    snippet: "Community platform for sharing and discovering creative coding sketches."
                }
            ],
            total_results: 3
        };
    }

    async runTest(imagePath) {
        try {
            // Load the image
            const imageBuffer = fs.readFileSync(imagePath);
            const imageBase64 = imageBuffer.toString('base64');
            
            console.log('Testing with image:', imagePath);
            
            // Ask Gemini to analyze the image and search for relevant techniques
            const result = await this.model.generateContent([
                {
                    text: "You have access to a web_search tool. The goal is to find techniques or algorithsm used to create this image. First anlayse the image and surmise if it was algorithmically generated, if so tyr to find the algorithm with ethe search tool Call the web_search function with relevant keywords, like how to do x or recreate y."
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
            
            // Debug the full response structure
            console.log('\n=== DEBUG INFO ===');
            console.log('Response object keys:', Object.keys(response));
            console.log('Response candidates:', response.candidates?.length || 'undefined');
            if (response.candidates && response.candidates[0]) {
                const candidate = response.candidates[0];
                console.log('First candidate keys:', Object.keys(candidate));
                console.log('Content parts:', candidate.content?.parts?.length || 'undefined');
                if (candidate.content?.parts) {
                    candidate.content.parts.forEach((part, i) => {
                        console.log(`Part ${i}:`, Object.keys(part));
                        if (part.functionCall) {
                            console.log(`  Function call found:`, part.functionCall);
                        }
                    });
                }
            }
            
            // Check for function calls in different possible locations
            console.log('Checking for function calls...');
            
            // Method 1: response.functionCalls()
            let functionCalls = [];
            if (typeof response.functionCalls === 'function') {
                functionCalls = response.functionCalls();
                console.log('Method 1 (functionCalls()):', functionCalls.length);
            } else {
                console.log('Method 1: functionCalls() method not available');
            }
            
            // Method 2: Check candidates for function calls
            if (response.candidates && response.candidates[0]) {
                const candidate = response.candidates[0];
                if (candidate.content?.parts) {
                    const functionCallParts = candidate.content.parts.filter(part => part.functionCall);
                    console.log('Method 2 (candidate parts):', functionCallParts.length, 'function calls found');
                    if (functionCallParts.length > 0) {
                        functionCalls = functionCallParts.map(part => part.functionCall);
                    }
                }
            }
            
            console.log('Total function calls found:', functionCalls.length);
            
            if (functionCalls && functionCalls.length > 0) {
                console.log(`\nGemini decided to search the web with ${functionCalls.length} queries...`);
                
                // Collect all function responses
                const functionResponses = [];
                
                for (const call of functionCalls) {
                    if (call.name === 'web_search') {
                        const { query } = call.args;
                        console.log('Search query:', query);
                        
                        const searchResults = await this.performWebSearch(query);
                        console.log('\nSearch results:');
                        searchResults.results.forEach((result, i) => {
                            console.log(`${i + 1}. ${result.title}`);
                            console.log(`   ${result.url}`);
                            console.log(`   ${result.snippet}\n`);
                        });
                        
                        // Add function response for this call
                        functionResponses.push({
                            functionResponse: {
                                name: 'web_search',
                                response: searchResults
                            }
                        });
                    }
                }
                
                // Build conversation history with all function responses
                const contents = [
                    {
                        role: 'user',
                        parts: [{
                            text: "Please analyze this image and search for relevant information to understand how it was created."
                        }, {
                            inlineData: {
                                mimeType: "image/png",
                                data: imageBase64
                            }
                        }]
                    },
                    response.candidates[0].content, // Add model's response with function calls
                    {
                        role: 'user', 
                        parts: functionResponses // Send all function responses
                    }
                ];

                const followUp = await this.model.generateContent({
                    contents: contents
                });
                
                const followUpResponse = await followUp.response;
                console.log('\nGemini analysis after web search:');
                console.log(followUpResponse.text());
            } else {
                console.log('\nGemini did not use the web search tool');
            }
        } catch (error) {
            console.error('Test failed:', error);
        }
    }
}

// Run the test
const test = new WebSearchTest();
const targetImagePath = 'target_images/test5.png';

if (!fs.existsSync(targetImagePath)) {
    console.error('Target image not found:', targetImagePath);
    console.log('Please add a test image to the target_images folder');
    process.exit(1);
}

test.runTest(targetImagePath); 