const SimplifiedPixelAnalyzer = require('./lib/simplifiedPixelAnalyzer.js');

async function testUpdatedAnalyzer() {
    console.log('='.repeat(80));
    console.log('TESTING UPDATED PIXEL ANALYZER');
    console.log('='.repeat(80));
    
    const analyzer = new SimplifiedPixelAnalyzer();
    
    console.log('\nAnalyzing target image with updated analyzer...');
    const result = await analyzer.analyzeTargetStructure('target_images/sample_target1.png');
    
    console.log(`\nImage Dimensions: ${result.dimensions.width}x${result.dimensions.height}`);
    console.log(`Total Regions Detected: ${result.regions.length}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('REGION DETAILS');
    console.log('='.repeat(60));
    
    result.regions.forEach((region, i) => {
        console.log(`\nREGION ${i+1}:`);
        console.log(`  Color: ${region.color} (${region.hex})`);
        console.log(`  Position: (${region.bounds.x}, ${region.bounds.y})`);
        console.log(`  Size: ${region.bounds.width} x ${region.bounds.height}`);
        console.log(`  Area: ${region.area} pixels`);
        
        const aspectRatio = Math.max(region.bounds.width, region.bounds.height) / 
                           Math.min(region.bounds.width, region.bounds.height);
        let shapeType = 'RECTANGLE';
        if (aspectRatio > 15) shapeType = 'VERY THIN LINE';
        else if (aspectRatio > 8) shapeType = 'THIN LINE/STRIPE';
        else if (aspectRatio > 3) shapeType = 'ELONGATED';
        
        console.log(`  Shape: ${shapeType} (ratio: ${aspectRatio.toFixed(2)})`);
        
        const totalArea = result.dimensions.width * result.dimensions.height;
        const coverage = ((region.area / totalArea) * 100).toFixed(1);
        console.log(`  Coverage: ${coverage}%`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('ISSUES TO CHECK');
    console.log('='.repeat(60));
    
    // Check for over-consolidation
    const blackRegions = result.regions.filter(r => r.color === 'black');
    if (blackRegions.length === 1 && blackRegions[0].area > 50000) {
        console.log('⚠️  BLACK OVER-CONSOLIDATION: Single black region covers too much area');
        console.log(`   Black region area: ${blackRegions[0].area} pixels`);
        console.log('   This suggests multiple black regions were incorrectly merged');
    }
    
    // Check white consistency
    const whiteRegions = result.regions.filter(r => r.color === 'white');
    if (whiteRegions.length > 1) {
        console.log(`ℹ️  WHITE REGIONS: ${whiteRegions.length} separate white regions detected`);
        whiteRegions.forEach((region, i) => {
            console.log(`   White ${i+1}: ${region.hex} at (${region.bounds.x},${region.bounds.y})`);
        });
        console.log('   Check if these should be consolidated or are correctly separate');
    }
    
    // Check for thin lines
    const thinLines = result.regions.filter(r => {
        const aspectRatio = Math.max(r.bounds.width, r.bounds.height) / 
                           Math.min(r.bounds.width, r.bounds.height);
        return aspectRatio > 8;
    });
    
    if (thinLines.length > 0) {
        console.log(`✓ THIN LINES DETECTED: ${thinLines.length} thin line(s) found`);
        thinLines.forEach((line, i) => {
            const aspectRatio = Math.max(line.bounds.width, line.bounds.height) / 
                               Math.min(line.bounds.width, line.bounds.height);
            const orientation = line.bounds.width > line.bounds.height ? 'HORIZONTAL' : 'VERTICAL';
            console.log(`   Line ${i+1}: ${line.color} ${orientation} at (${line.bounds.x},${line.bounds.y}) - ratio: ${aspectRatio.toFixed(2)}`);
        });
    }
    
    // Expected regions check
    console.log('\n' + '='.repeat(60));
    console.log('EXPECTED VS ACTUAL');
    console.log('='.repeat(60));
    
    const expectedColors = ['yellow', 'white', 'black', 'gray', 'red'];
    const detectedColors = [...new Set(result.regions.map(r => r.color))];
    
    console.log('Expected colors:', expectedColors.join(', '));
    console.log('Detected colors:', detectedColors.join(', '));
    
    expectedColors.forEach(color => {
        const count = result.regions.filter(r => r.color === color).length;
        if (count === 0) {
            console.log(`❌ MISSING: ${color}`);
        } else if (count === 1) {
            console.log(`✓ FOUND: ${color} (1 region)`);
        } else {
            console.log(`⚠️  MULTIPLE: ${color} (${count} regions)`);
        }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('UPDATED ANALYZER TEST COMPLETE');
    console.log('='.repeat(80));
}

testUpdatedAnalyzer().catch(console.error);
