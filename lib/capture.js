import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

class SketchCapture {
    constructor() {
        this.browser = null;
    }
    
    async init() {
        console.log('Launching browser...');
        this.browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }
    
    async captureSketch(sketchUrl, outputPath) {
        if (!this.browser) {
            await this.init();
        }
        
        const page = await this.browser.newPage();
        
        try {
            console.log(`Loading sketch: ${sketchUrl}`);
            await page.goto(sketchUrl, { waitUntil: 'networkidle0' });
            
            // Wait a bit for p5.js to render
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Find the canvas element and take screenshot
            const canvas = await page.$('canvas');
            if (!canvas) {
                throw new Error('No canvas found on page');
            }
            
            console.log(`Taking screenshot: ${outputPath}`);
            await canvas.screenshot({ path: outputPath });
            
            console.log('Screenshot saved successfully');
            return outputPath;
            
        } catch (error) {
            console.error('Error capturing sketch:', error);
            throw error;
        } finally {
            await page.close();
        }
    }
    
    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// Test function
async function testCapture() {
    const capture = new SketchCapture();
    
    try {
        // Ensure screenshots directory exists
        if (!fs.existsSync('screenshots')) {
            fs.mkdirSync('screenshots');
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = `screenshots/test-sketch-${timestamp}.png`;
        
        await capture.captureSketch('http://localhost:3000/sketches/test-sketch.html', outputPath);
        console.log(`Test complete! Screenshot saved to: ${outputPath}`);
        
    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await capture.close();
    }
}

// Export for use in other modules
export default SketchCapture;


