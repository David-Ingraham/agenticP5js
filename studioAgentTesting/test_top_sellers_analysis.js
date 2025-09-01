import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from parent directory
config({ path: path.resolve('../.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

async function loadImageAsBase64(imagePath) {
    try {
        const imageBuffer = fs.readFileSync(imagePath);
        const base64 = imageBuffer.toString('base64');
        
        // Determine mime type from file extension
        const ext = path.extname(imagePath).toLowerCase();
        let mimeType;
        switch (ext) {
            case '.png':
                mimeType = 'image/png';
                break;
            case '.jpg':
            case '.jpeg':
                mimeType = 'image/jpeg';
                break;
            case '.gif':
                mimeType = 'image/gif';
                break;
            case '.webp':
                mimeType = 'image/webp';
                break;
            default:
                mimeType = 'image/png'; // default
        }
        
        return {
            inlineData: {
                data: base64,
                mimeType: mimeType
            }
        };
    } catch (error) {
        console.error(`Failed to load image ${imagePath}:`, error.message);
        return null;
    }
}

async function analyzeTopSellerImages() {
    const imagesDir = path.join(__dirname, 'downloaded_images');
    const metadataPath = path.join(imagesDir, 'collections_metadata.json');
    
    // Load metadata to get collection info
    let collections = [];
    if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        collections = metadata.filter(item => item.downloaded);
    }
    
    console.log(`Found ${collections.length} downloaded images to analyze`);
    
    // Load all images
    const imageParts = [];
    const imageDescriptions = [];
    
    for (const collection of collections) {
        if (collection.localPath && fs.existsSync(collection.localPath)) {
            console.log(`Loading: ${collection.name}`);
            
            // Skip GIF files for now - Gemini might not support them
            const ext = path.extname(collection.localPath).toLowerCase();
            if (ext === '.gif') {
                console.log(`  Skipping GIF file: ${collection.name}`);
                continue;
            }
            
            const imagePart = await loadImageAsBase64(collection.localPath);
            if (imagePart) {
                imageParts.push(imagePart);
                imageDescriptions.push(`${collection.name} (Rank #${collection.rank}, Floor: ${(collection.floorPrice / 1e9).toFixed(2)} SOL)`);
            }
        }
    }
    
    if (imageParts.length === 0) {
        console.error('No images loaded successfully');
        return null;
    }
    
    console.log(`Loaded ${imageParts.length} images for analysis`);
    
    // Create the analysis prompt
    const prompt = `You are analyzing the top ${imageParts.length} trending NFT collections on Solana. These are the current best-sellers:

${imageDescriptions.map((desc, i) => `${i + 1}. ${desc}`).join('\n')}

Please analyze these images and provide:

1. INDIVIDUAL ANALYSIS: Briefly describe the visual style, color palette, artistic approach, and key elements of each image.

2. PATTERN IDENTIFICATION: What common elements, themes, or styles do you see across these trending collections? Consider:
   - Color schemes and palettes
   - Artistic styles (pixel art, 3D, hand-drawn, etc.)
   - Character types or subjects
   - Compositional elements
   - Visual complexity levels

3. SYNTHESIZED STYLE: Based on the analysis, create a single cohesive art style description that combines the most popular and marketable elements from these top sellers. This should be detailed enough to guide algorithmic art generation.

4. P5.JS DIRECTION: Briefly suggest how this synthesized style could be implemented in P5.js (colors, shapes, techniques, etc.).

Focus on creating a style that would appeal to current Solana NFT buyers based on what's actually selling well.`;

    try {
        console.log('Sending images to Gemini for analysis...');
        
        const response = await fetch(`${GEMINI_BASE_URL}/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        ...imageParts
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
        const analysis = result.candidates[0].content.parts[0].text;
        
        // Save the analysis
        const analysisPath = path.join(imagesDir, 'style_analysis.txt');
        fs.writeFileSync(analysisPath, analysis);
        
        console.log('\n=== VISUAL ANALYSIS COMPLETE ===\n');
        console.log(analysis);
        console.log(`\nAnalysis saved to: ${analysisPath}`);
        
        return analysis;
        
    } catch (error) {
        console.error('Error analyzing images:', error.message);
        return null;
    }
}

async function main() {
    console.log('Starting Top Sellers Visual Analysis...\n');
    
    if (!GEMINI_API_KEY) {
        console.error('Error: GEMINI_API_KEY not found in environment variables');
        console.error('Make sure .env file exists in parent directory with GEMINI_API_KEY');
        return;
    }
    
    const analysis = await analyzeTopSellerImages();
    
    if (analysis) {
        console.log('\nSuccess! Visual analysis complete.');
        console.log('Next step: Use this analysis to generate P5.js art code.');
    } else {
        console.log('Analysis failed. Check the errors above.');
    }
}

main().catch(console.error); 