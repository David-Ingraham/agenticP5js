const SimplifiedPixelAnalyzer = require('./lib/simplifiedPixelAnalyzer');
const fs = require('fs');

async function testSimplifiedAnalysis() {
    console.log('Testing Simplified Pixel Analysis...');
    
    const analyzer = new SimplifiedPixelAnalyzer();
    const targetPath = 'target_images/sample_target1.png';
    
    // Find a generated image to compare against
    const sessionsDir = 'sessions';
    let generatedPath = null;
    
    if (fs.existsSync(sessionsDir)) {
        const sessions = fs.readdirSync(sessionsDir);
        for (const session of sessions) {
            const testPath = `${sessionsDir}/${session}/iteration1.png`;
            if (fs.existsSync(testPath)) {
                generatedPath = testPath;
                break;
            }
        }
    }
    
    if (!generatedPath) {
        console.error('No generated image found for comparison');
        return;
    }
    
    try {
        console.log(`Target: ${targetPath}`);
        console.log(`Generated: ${generatedPath}`);
        console.log('');
        
        // Analyze target structure
        console.log('Analyzing target image...');
        const targetStructure = await analyzer.analyzeTargetStructure(targetPath);
        
        console.log('TARGET IMAGE STRUCTURE:');
        console.log('='.repeat(50));
        targetStructure.regions.forEach((region, index) => {
            console.log(`${index + 1}. ${region.color.toUpperCase()}`);
            console.log(`   Position: (${region.bounds.x}, ${region.bounds.y})`);
            console.log(`   Size: ${region.bounds.width} x ${region.bounds.height}`);
            console.log(`   Area: ${region.area} pixels`);
            console.log('');
        });
        
        // Compare with generated image
        console.log('Comparing with generated image...');
        const comparison = await analyzer.compareAndGenerateInstructions(targetPath, generatedPath);
        
        console.log('COMPARISON RESULTS:');
        console.log('='.repeat(50));
        console.log(`Similarity Score: ${comparison.score}/10`);
        console.log('');
        
        console.log('PRECISE INSTRUCTIONS FOR GEMINI:');
        console.log('-'.repeat(40));
        if (comparison.instructions.length === 0) {
            console.log('Perfect! No changes needed.');
        } else {
            comparison.instructions.forEach((instruction, index) => {
                console.log(`${index + 1}. ${instruction}`);
            });
        }
        
        console.log('');
        console.log('GENERATED IMAGE STRUCTURE:');
        console.log('='.repeat(50));
        comparison.generatedStructure.regions.forEach((region, index) => {
            console.log(`${index + 1}. ${region.color.toUpperCase()}`);
            console.log(`   Position: (${region.bounds.x}, ${region.bounds.y})`);
            console.log(`   Size: ${region.bounds.width} x ${region.bounds.height}`);
            console.log(`   Area: ${region.area} pixels`);
            console.log('');
        });
        
        // Save results
        const outputDir = generatedPath.substring(0, generatedPath.lastIndexOf('/'));
        const resultPath = `${outputDir}/simplified_analysis.json`;
        fs.writeFileSync(resultPath, JSON.stringify(comparison, null, 2));
        console.log(`Results saved to: ${resultPath}`);
        
    } catch (error) {
        console.error('Analysis failed:', error);
    }
}

// Run test
if (require.main === module) {
    testSimplifiedAnalysis();
}

module.exports = testSimplifiedAnalysis;
