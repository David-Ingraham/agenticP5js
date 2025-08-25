const PixelAnalyzer = require('./lib/pixelAnalyzer');
const fs = require('fs');

async function testPixelAnalysis() {
    console.log('Testing Pixel Analysis with Sharp...');
    
    const analyzer = new PixelAnalyzer();
    const targetPath = 'target_images/sample_target1.png';
    
    if (!fs.existsSync(targetPath)) {
        console.error(`Target image not found: ${targetPath}`);
        return;
    }
    
    try {
        // Analyze target image structure
        console.log('\nAnalyzing target image structure...');
        const targetAnalysis = await analyzer.analyzeTargetImage(targetPath);
        
        console.log('\nTarget Image Structure:');
        console.log('='.repeat(50));
        console.log(`Dimensions: ${targetAnalysis.dimensions.width}x${targetAnalysis.dimensions.height}`);
        console.log('\nColor Regions Found:');
        
        targetAnalysis.structure.forEach((region, index) => {
            console.log(`${index + 1}. ${region.color.toUpperCase()}`);
            console.log(`   Position: x=${region.bounds.x}, y=${region.bounds.y}`);
            console.log(`   Size: ${region.bounds.width}x${region.bounds.height}`);
            console.log(`   RGB: (${region.rgb.r}, ${region.rgb.g}, ${region.rgb.b})`);
            console.log(`   Area: ${region.area} pixels`);
            console.log('');
        });
        
        // Test comparison with an existing generated image if available
        const sessionsDir = 'sessions';
        if (fs.existsSync(sessionsDir)) {
            const sessions = fs.readdirSync(sessionsDir);
            if (sessions.length > 0) {
                const latestSession = sessions[sessions.length - 1];
                const generatedPath = `${sessionsDir}/${latestSession}/iteration1.png`;
                
                if (fs.existsSync(generatedPath)) {
                    console.log('\nTesting comparison with generated image...');
                    console.log('='.repeat(50));
                    
                    const comparison = await analyzer.compareImages(targetPath, generatedPath);
                    
                    console.log(`Pixel-based Similarity Score: ${comparison.score}/10`);
                    console.log('\nPrecise Instructions for Gemini:');
                    console.log(comparison.instructions);
                    
                    console.log('\nDetailed Differences:');
                    comparison.differences.forEach((diff, index) => {
                        console.log(`${index + 1}. ${diff.type}: ${diff.instruction}`);
                    });
                    
                    // Save analysis for reference
                    const analysisPath = `${sessionsDir}/${latestSession}/pixel_analysis.json`;
                    fs.writeFileSync(analysisPath, JSON.stringify({
                        targetAnalysis,
                        comparison
                    }, null, 2));
                    
                    console.log(`\nAnalysis saved to: ${analysisPath}`);
                }
            }
        }
        
        console.log('\nPixel analysis test completed!');
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run test
if (require.main === module) {
    testPixelAnalysis();
}

module.exports = testPixelAnalysis;
