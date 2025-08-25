const sharp = require('sharp');

class SimplifiedPixelAnalyzer {
    constructor() {
        this.colorTolerance = 50; // RGB tolerance for color matching
        this.minRegionSize = 1000; // Minimum pixels for a region to be considered
    }
    
    /**
     * Get target image dimensions without resizing
     */
    async getTargetDimensions(imagePath) {
        const metadata = await sharp(imagePath).metadata();
        return {
            width: metadata.width,
            height: metadata.height,
            aspectRatio: metadata.width / metadata.height
        };
    }
    
    /**
     * Get precise measurements from target image
     */
    async analyzeTargetStructure(imagePath, targetDimensions = null) {
        console.log(`Analyzing target image: ${imagePath}`);
        
        // Get dimensions if not provided
        if (!targetDimensions) {
            targetDimensions = await this.getTargetDimensions(imagePath);
        }
        
        console.log(`Target dimensions: ${targetDimensions.width}x${targetDimensions.height} (aspect ratio: ${targetDimensions.aspectRatio.toFixed(2)})`);
        
        // Use original dimensions - no resizing to square
        const { data, info } = await sharp(imagePath)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
            
        console.log(`Analyzed at: ${info.width}x${info.height}`);
        
        // Find major color regions using a grid-based approach
        const regions = this.findMajorRegions(data, info.width, info.height);
        
        return {
            dimensions: { width: info.width, height: info.height },
            regions: regions
        };
    }
    
    /**
     * Find major color regions using connected component analysis
     */
    findMajorRegions(data, width, height) {
        const visited = new Set();
        const regions = [];
        
        // Use a smaller sampling step for better thin line detection
        const step = 2;
        
        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                const pixelKey = `${x},${y}`;
                if (visited.has(pixelKey)) continue;
                
                const index = (y * width + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const a = data[index + 3];
                
                if (a < 128) continue; // Skip transparent pixels
                
                // Flood fill to find connected region
                const region = this.floodFillRegion(data, width, height, x, y, r, g, b, visited, step);
                
                if (region && region.pixels.length >= 5) { // Even lower minimum pixel count for thin lines
                    const bounds = this.calculateBounds(region.pixels);
                    const area = bounds.width * bounds.height;
                    const color = this.rgbToColorName(r, g, b);
                    
                    // Calculate aspect ratio for line detection
                    const aspectRatio = Math.max(bounds.width, bounds.height) / 
                                      Math.min(bounds.width, bounds.height);
                    
                    // Special handling for different region types
                    let minAreaThreshold = this.minRegionSize;
                    
                    // Very thin lines (structural dividers)
                    if (aspectRatio > 20) {
                        minAreaThreshold = 50; // Very low threshold for very thin lines
                    }
                    // Moderate lines/stripes  
                    else if (aspectRatio > 8) {
                        minAreaThreshold = 200; // Low threshold for lines
                    }
                    // Red regions (often small but important)
                    else if (color === 'red') {
                        minAreaThreshold = 150; // Lower threshold for red
                    }
                    // Black regions (could be thin dividers)
                    else if (color === 'black' && (bounds.width <= 5 || bounds.height <= 5)) {
                        minAreaThreshold = 100; // Lower threshold for thin black elements
                    }
                    
                    if (area >= minAreaThreshold) {
                        regions.push({
                            color: color, // Keep color name for internal logic
                            hex: this.rgbToHex(r, g, b), // Add exact hex value
                            rgb: { r, g, b },
                            bounds: bounds,
                            area: area,
                            pixelCount: region.pixels.length
                        });
                    }
                }
            }
        }
        
        // Consolidate overlapping regions of same color
        const consolidatedRegions = this.consolidateOverlappingRegions(regions);
        
        // Filter out regions that are too small compared to the largest region
        const filteredRegions = this.filterSignificantRegions(consolidatedRegions);
        
        // Sort by area (largest first)
        return filteredRegions.sort((a, b) => b.area - a.area);
    }
    
    /**
     * Flood fill to find connected region of similar color
     */
    floodFillRegion(data, width, height, startX, startY, targetR, targetG, targetB, visited, step) {
        const pixels = [];
        const queue = [{x: startX, y: startY}];
        const regionVisited = new Set();
        
        while (queue.length > 0) {
            const {x, y} = queue.shift();
            const pixelKey = `${x},${y}`;
            
            if (regionVisited.has(pixelKey) || visited.has(pixelKey)) continue;
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            
            const index = (y * width + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const a = data[index + 3];
            
            if (a < 128) continue;
            
            // Check if color is similar enough
            const colorDistance = Math.sqrt(
                (r - targetR) ** 2 + 
                (g - targetG) ** 2 + 
                (b - targetB) ** 2
            );
            
            if (colorDistance > this.colorTolerance) continue;
            
            regionVisited.add(pixelKey);
            visited.add(pixelKey);
            pixels.push({x, y});
            
            // Add neighbors to queue (with smaller step for thin lines)
            const neighborStep = Math.min(step, 2); // Use smaller step for neighbor detection
            queue.push(
                {x: x + neighborStep, y: y},
                {x: x - neighborStep, y: y},
                {x: x, y: y + neighborStep},
                {x: x, y: y - neighborStep}
            );
        }
        
        return pixels.length > 0 ? {pixels} : null;
    }
    
    /**
     * Consolidate overlapping regions of the same color
     */
    consolidateOverlappingRegions(regions) {
        const consolidated = [];
        const used = new Set();
        
        for (let i = 0; i < regions.length; i++) {
            if (used.has(i)) continue;
            
            const mainRegion = regions[i];
            const overlapping = [mainRegion];
            used.add(i);
            
            // Find all regions of same color that overlap (but be more selective)
            for (let j = i + 1; j < regions.length; j++) {
                if (used.has(j)) continue;
                
                const otherRegion = regions[j];
                
                // Only merge regions of same color if they actually overlap
                if (mainRegion.color === otherRegion.color && this.shouldMergeRegions(mainRegion, otherRegion)) {
                    overlapping.push(otherRegion);
                    used.add(j);
                }
            }
            
            // Merge overlapping regions
            if (overlapping.length > 1) {
                const mergedRegion = this.mergeRegions(overlapping);
                consolidated.push(mergedRegion);
            } else {
                consolidated.push(mainRegion);
            }
        }
        
        return consolidated;
    }
    
    /**
     * Check if two regions overlap or are adjacent (for consolidation)
     */
    regionsOverlap(bounds1, bounds2) {
        const margin = 3; // Reduced margin to avoid merging thin dividers
        
        return !(bounds1.x + bounds1.width + margin < bounds2.x || 
                 bounds2.x + bounds2.width + margin < bounds1.x || 
                 bounds1.y + bounds1.height + margin < bounds2.y || 
                 bounds2.y + bounds2.height + margin < bounds1.y);
    }
    
    /**
     * Determine if two regions should be merged based on more selective criteria
     */
    shouldMergeRegions(region1, region2) {
        // Don't merge if they don't overlap at all
        if (!this.regionsOverlap(region1.bounds, region2.bounds)) {
            return false;
        }
        
        // Calculate the sizes and positions
        const area1 = region1.area;
        const area2 = region2.area;
        const totalImageArea = 261 * 373; // Target image size
        
        // Don't merge if one region is very large (likely background) and the other is small (likely structural element)
        if ((area1 > totalImageArea * 0.5 && area2 < totalImageArea * 0.1) ||
            (area2 > totalImageArea * 0.5 && area1 < totalImageArea * 0.1)) {
            return false;
        }
        
        // Check if regions are thin lines/dividers - be very careful about merging these
        const aspectRatio1 = Math.max(region1.bounds.width, region1.bounds.height) / 
                           Math.min(region1.bounds.width, region1.bounds.height);
        const aspectRatio2 = Math.max(region2.bounds.width, region2.bounds.height) / 
                           Math.min(region2.bounds.width, region2.bounds.height);
        
        // Don't merge thin lines/dividers unless they're clearly the same structural element
        if (aspectRatio1 > 8 || aspectRatio2 > 8) {
            // Only merge if they're aligned and close (same line)
            const isHorizontalLine1 = region1.bounds.width > region1.bounds.height;
            const isHorizontalLine2 = region2.bounds.width > region2.bounds.height;
            
            if (isHorizontalLine1 && isHorizontalLine2) {
                // Same horizontal line if y positions are very close
                return Math.abs(region1.bounds.y - region2.bounds.y) <= 5;
            } else if (!isHorizontalLine1 && !isHorizontalLine2) {
                // Same vertical line if x positions are very close
                return Math.abs(region1.bounds.x - region2.bounds.x) <= 5;
            }
            return false; // Don't merge lines of different orientations
        }
        
        // For other regions, use normal overlap check
        return true;
    }
    
    /**
     * Merge multiple regions into one
     */
    mergeRegions(regions) {
        const allBounds = regions.map(r => r.bounds);
        const minX = Math.min(...allBounds.map(b => b.x));
        const minY = Math.min(...allBounds.map(b => b.y));
        const maxX = Math.max(...allBounds.map(b => b.x + b.width));
        const maxY = Math.max(...allBounds.map(b => b.y + b.height));
        
        return {
            color: regions[0].color,
            hex: regions[0].hex,
            rgb: regions[0].rgb,
            bounds: {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY
            },
            area: (maxX - minX) * (maxY - minY),
            pixelCount: regions.reduce((sum, r) => sum + (r.pixelCount || 0), 0)
        };
    }
    
    /**
     * Filter out regions that are too small to be significant, but keep important thin lines
     */
    filterSignificantRegions(regions) {
        if (regions.length === 0) return regions;
        
        const maxArea = Math.max(...regions.map(r => r.area));
        const minSignificantArea = maxArea * 0.02; // Reduced from 5% to 2% to catch thin lines
        
        return regions.filter(region => {
            // Always keep red regions (often dividers/accents)
            if (region.color === 'red') {
                return true;
            }
            
            // Keep regions that are very thin lines (structural dividers)
            const aspectRatio = Math.max(region.bounds.width, region.bounds.height) / 
                              Math.min(region.bounds.width, region.bounds.height);
            if (aspectRatio > 15 && region.area > 50) { // Very thin line detection
                return true;
            }
            
            // Keep moderate thin lines 
            if (aspectRatio > 8 && region.area > 200) { // Moderate thin line detection
                return true;
            }
            
            // Keep thin black elements (could be dividers)
            if (region.color === 'black' && (region.bounds.width <= 5 || region.bounds.height <= 5) && region.area > 100) {
                return true;
            }
            
            // Standard area filtering for other regions
            return region.area >= minSignificantArea;
        });
    }
    
    /**
     * Get standardized color key for grouping similar colors
     */
    getColorKey(r, g, b) {
        // Special handling for common colors to group them better
        
        // White grouping - more tolerant
        if (r > 180 && g > 180 && b > 180 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && Math.abs(r - b) < 30) {
            return 'white_group';
        }
        
        // Black grouping - more tolerant
        if (r < 60 && g < 60 && b < 60) {
            return 'black_group';
        }
        
        // Gray grouping
        if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && r > 60 && r < 180) {
            return 'gray_group';
        }
        
        // Red grouping
        if (r > 150 && r > g * 1.5 && r > b * 1.5) {
            return 'red_group';
        }
        
        // Yellow grouping
        if (r > 200 && g > 150 && b < 100) {
            return 'yellow_group';
        }
        
        // Default: Round to nearest 25 for other colors
        const roundTo = 25;
        const rKey = Math.round(r / roundTo) * roundTo;
        const gKey = Math.round(g / roundTo) * roundTo;
        const bKey = Math.round(b / roundTo) * roundTo;
        return `${rKey},${gKey},${bKey}`;
    }
    
    /**
     * Calculate bounding box from sample points
     */
    calculateBounds(samples) {
        const xs = samples.map(s => s.x);
        const ys = samples.map(s => s.y);
        
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }
    
    /**
     * Convert RGB to color name with improved color detection
     */
    rgbToColorName(r, g, b) {
        // Primary colors with multiple variants and better thresholds
        const colors = [
            // Black variations
            { name: 'black', r: 0, g: 0, b: 0, threshold: 80 },
            
            // White variations  
            { name: 'white', r: 255, g: 255, b: 255, threshold: 80 },
            
            // Red variations - multiple shades
            { name: 'red', r: 255, g: 0, b: 0, threshold: 100 },
            { name: 'red', r: 220, g: 20, b: 20, threshold: 60 },
            { name: 'red', r: 200, g: 0, b: 0, threshold: 60 },
            { name: 'red', r: 180, g: 0, b: 0, threshold: 50 },
            
            // Yellow variations
            { name: 'yellow', r: 255, g: 255, b: 0, threshold: 80 },
            { name: 'yellow', r: 240, g: 240, b: 0, threshold: 60 },
            { name: 'yellow', r: 255, g: 200, b: 0, threshold: 60 },
            
            // Blue variations
            { name: 'blue', r: 0, g: 0, b: 255, threshold: 80 },
            { name: 'blue', r: 0, g: 100, b: 200, threshold: 60 },
            
            // Gray variations
            { name: 'gray', r: 128, g: 128, b: 128, threshold: 80 },
            { name: 'gray', r: 160, g: 160, b: 160, threshold: 40 },
            { name: 'gray', r: 100, g: 100, b: 100, threshold: 40 }
        ];
        
        // Check against known colors first
        for (const color of colors) {
            const distance = Math.sqrt(
                (r - color.r) ** 2 + 
                (g - color.g) ** 2 + 
                (b - color.b) ** 2
            );
            if (distance < color.threshold) {
                return color.name;
            }
        }
        
        // Enhanced red detection for missing reds
        if (r > 150 && r > g * 2 && r > b * 2) {
            return 'red';
        }
        
        // Enhanced yellow detection
        if (r > 200 && g > 200 && b < 100) {
            return 'yellow';
        }
        
        // Better gray detection
        if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && r > 50 && r < 200) {
            return 'gray';
        }
        
        // Better black detection
        if (r < 50 && g < 50 && b < 50) {
            return 'black';
        }
        
        // Better white detection with more tolerance
        if (r > 180 && g > 180 && b > 180 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && Math.abs(r - b) < 30) {
            return 'white';
        }
        
        return `rgb(${r},${g},${b})`;
    }
    
    /**
     * Convert RGB to hex color value
     */
    rgbToHex(r, g, b) {
        const toHex = (component) => {
            const hex = Math.round(component).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    }
    
    /**
     * Compare target vs generated and create precise instructions
     */
    async compareAndGenerateInstructions(targetPath, generatedPath, targetDimensions = null) {
        console.log('Comparing images with simplified analysis...');
        
        // Get target dimensions if not provided
        if (!targetDimensions) {
            targetDimensions = await this.getTargetDimensions(targetPath);
        }
        
        const targetStructure = await this.analyzeTargetStructure(targetPath, targetDimensions);
        const generatedStructure = await this.analyzeTargetStructure(generatedPath, targetDimensions);
        
        console.log(`Target regions: ${targetStructure.regions.length}`);
        console.log(`Generated regions: ${generatedStructure.regions.length}`);
        
        // Generate simple, actionable instructions
        const instructions = this.createSimpleInstructions(targetStructure.regions, generatedStructure.regions);
        
        return {
            targetStructure,
            generatedStructure,
            instructions,
            score: this.calculateSimpleScore(targetStructure.regions, generatedStructure.regions),
            targetDimensions
        };
    }
    
    /**
     * Create simple instructions for the most important regions
     */
    createSimpleInstructions(targetRegions, generatedRegions) {
        const instructions = [];
        
        // Focus on the 5 most important regions (increased to catch red dividers)
        const mainTargetRegions = targetRegions.slice(0, 5);
        
        for (const targetRegion of mainTargetRegions) {
            const matchingRegion = this.findBestColorMatch(targetRegion, generatedRegions);
            
            // Determine if this is likely a line/stripe based on aspect ratio
            const aspectRatio = Math.max(targetRegion.bounds.width, targetRegion.bounds.height) / 
                              Math.min(targetRegion.bounds.width, targetRegion.bounds.height);
            const isLine = aspectRatio > 8;
            const shapeType = isLine ? 'line' : 'rectangle';
            
            if (!matchingRegion) {
                if (isLine) {
                    instructions.push(
                        `Add ${targetRegion.hex} ${shapeType}: ${targetRegion.bounds.width > targetRegion.bounds.height ? 'horizontal' : 'vertical'} at (${targetRegion.bounds.x}, ${targetRegion.bounds.y}), size ${targetRegion.bounds.width}x${targetRegion.bounds.height}`
                    );
                } else {
                    instructions.push(
                        `Add ${targetRegion.hex} ${shapeType}: rect(${targetRegion.bounds.x}, ${targetRegion.bounds.y}, ${targetRegion.bounds.width}, ${targetRegion.bounds.height})`
                    );
                }
            } else {
                // Check if position/size is significantly different  
                const positionDiff = Math.abs(targetRegion.bounds.x - matchingRegion.bounds.x) + 
                                   Math.abs(targetRegion.bounds.y - matchingRegion.bounds.y);
                const sizeDiff = Math.abs(targetRegion.bounds.width - matchingRegion.bounds.width) + 
                               Math.abs(targetRegion.bounds.height - matchingRegion.bounds.height);
                
                if (positionDiff > 15 || sizeDiff > 15) {
                    instructions.push(
                        `Fix ${targetRegion.hex} ${shapeType}: move to (${targetRegion.bounds.x}, ${targetRegion.bounds.y}) and resize to ${targetRegion.bounds.width}x${targetRegion.bounds.height}`
                    );
                }
            }
        }
        
        return instructions.slice(0, 4); // Max 4 instructions (increased for better coverage)
    }
    
    /**
     * Find best matching region by color
     */
    findBestColorMatch(targetRegion, generatedRegions) {
        return generatedRegions.find(region => region.color === targetRegion.color);
    }
    
    /**
     * Calculate simple similarity score (0-100 scale)
     */
    calculateSimpleScore(targetRegions, generatedRegions) {
        const maxRegions = Math.max(targetRegions.length, generatedRegions.length, 4);
        let score = 100; // Start with perfect score
        
        const mainTargetRegions = targetRegions.slice(0, 4);
        
        for (const targetRegion of mainTargetRegions) {
            const match = this.findBestColorMatch(targetRegion, generatedRegions);
            
            if (!match) {
                score -= 25; // Missing color region (major penalty)
            } else {
                // Deduct for position/size differences
                const positionDiff = Math.abs(targetRegion.bounds.x - match.bounds.x) + 
                                   Math.abs(targetRegion.bounds.y - match.bounds.y);
                const sizeDiff = Math.abs(targetRegion.bounds.width - match.bounds.width) + 
                               Math.abs(targetRegion.bounds.height - match.bounds.height);
                
                // More granular scoring on 100-point scale
                if (positionDiff > 50) score -= 5;
                else if (positionDiff > 20) score -= 2;
                
                if (sizeDiff > 50) score -= 5;
                else if (sizeDiff > 20) score -= 2;
            }
        }
        
        return Math.max(0, Math.round(score));
    }
}

module.exports = SimplifiedPixelAnalyzer;
