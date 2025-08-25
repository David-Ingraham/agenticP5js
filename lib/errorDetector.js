const puppeteer = require('puppeteer-core');
const fs = require('fs');

class ErrorDetector {
    constructor() {
        this.browser = null;
    }
    
    async init() {
        if (this.browser) return;
        
        console.log('Launching browser for error detection...');
        this.browser = await puppeteer.launch({
            headless: true,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }
    
    /**
     * Detect JavaScript errors in HTML file by loading it in browser
     */
    async detectErrors(htmlFilePath, serverUrl) {
        if (!this.browser) {
            await this.init();
        }
        
        const page = await this.browser.newPage();
        const errors = [];
        const consoleMessages = [];
        
        // Capture console errors
        page.on('console', msg => {
            consoleMessages.push({
                type: msg.type(),
                text: msg.text(),
                location: msg.location()
            });
            
            if (msg.type() === 'error') {
                errors.push({
                    type: 'console_error',
                    message: msg.text(),
                    location: msg.location()
                });
            }
        });
        
        // Capture JavaScript errors
        page.on('pageerror', error => {
            errors.push({
                type: 'page_error',
                message: error.message,
                stack: error.stack
            });
        });
        
        try {
            console.log(`Loading page for error detection: ${serverUrl}`);
            
            // Set a timeout to catch loading issues
            await page.goto(serverUrl, { 
                waitUntil: 'networkidle0',
                timeout: 10000 
            });
            
            // Wait a bit for P5.js to initialize and run
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check if canvas was created (indicates P5.js ran successfully)
            const canvasExists = await page.$('canvas');
            
            if (!canvasExists) {
                errors.push({
                    type: 'no_canvas',
                    message: 'No canvas element found - P5.js may not have initialized properly'
                });
            }
            
            return {
                hasErrors: errors.length > 0,
                errors: errors,
                consoleMessages: consoleMessages,
                canvasExists: !!canvasExists
            };
            
        } catch (error) {
            errors.push({
                type: 'load_error',
                message: `Failed to load page: ${error.message}`
            });
            
            return {
                hasErrors: true,
                errors: errors,
                consoleMessages: consoleMessages,
                canvasExists: false
            };
            
        } finally {
            await page.close();
        }
    }
    
    /**
     * Format errors for display
     */
    formatErrors(errorResult) {
        if (!errorResult.hasErrors) {
            return 'No JavaScript errors detected.';
        }
        
        const errorMessages = errorResult.errors.map(error => {
            switch (error.type) {
                case 'console_error':
                    return `Console Error: ${error.message}`;
                case 'page_error':
                    return `JavaScript Error: ${error.message}`;
                case 'no_canvas':
                    return `P5.js Error: ${error.message}`;
                case 'load_error':
                    return `Loading Error: ${error.message}`;
                default:
                    return `Unknown Error: ${error.message}`;
            }
        });
        
        return errorMessages.join('\n');
    }
    
    /**
     * Format errors for Gemini to fix
     */
    formatErrorsForGemini(errorResult) {
        if (!errorResult.hasErrors) {
            return null;
        }
        
        const errorSummary = [
            'JavaScript errors detected in your code:',
            ''
        ];
        
        errorResult.errors.forEach((error, index) => {
            errorSummary.push(`${index + 1}. ${error.message}`);
        });
        
        errorSummary.push('');
        errorSummary.push('Please fix ONLY these JavaScript errors while keeping the visual intent intact.');
        
        return errorSummary.join('\n');
    }
    
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = ErrorDetector;
