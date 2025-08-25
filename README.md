# Agentic P5.js Art Generator

An autonomous system that uses Google's Gemini AI to iteratively generate P5.js code to recreate target images through visual feedback loops.

## Overview

This project implements an agentic workflow where Gemini:
1. Generates P5.js code to recreate a target image
2. Captures screenshots of the generated code
3. Visually compares the result with the target
4. Provides specific improvement instructions
5. Generates improved code based on its own analysis
6. Repeats until satisfied with the result

## Features

- **Visual AI Comparison**: Gemini directly analyzes images without complex pixel analysis
- **Self-Improving**: AI learns from its own iteration history to avoid repeating mistakes
- **Error Detection**: Automatic JavaScript error detection and fixing
- **Iterative Memory**: System remembers previous attempts to break out of repetitive loops
- **No Scoring Bias**: Focuses on concrete visual improvements rather than inflated self-scoring

## Dependencies

### Node.js Packages
```bash
npm install express puppeteer-core dotenv sharp
```

### Required Software
- **Node.js** (v16 or higher)
- **Google Chrome** (for Puppeteer screenshots)

### API Keys
- **Google Gemini API Key** (free tier available)

## Installation

1. **Clone/Download** the project
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Create environment file**:
   ```bash
   cp .env.example .env
   ```
4. **Add your Gemini API key** to `.env`:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

## Project Structure

```
agenticP5js/
├── gemini_only_orchestrator.js    # Main orchestration script
├── lib/
│   ├── geminiCodeGenerator.js     # Gemini API integration
│   ├── capture.js                 # Screenshot capture using Puppeteer
│   ├── errorDetector.js           # JavaScript error detection
│   └── simplifiedPixelAnalyzer.js # Legacy pixel analysis (unused)
├── utils/
│   └── server.js                  # Express server for serving P5.js sketches
├── target_images/                 # Place target images here
├── sessions/                      # Generated sessions and results
└── README.md
```

## Usage

### 1. Start the Server
```bash
node utils/server.js
```
Keep this running in a separate terminal.

### 2. Add Target Image
Place your target image in the `target_images/` folder (PNG format recommended).

### 3. Update Target Path
Edit the target image path in `gemini_only_orchestrator.js`:
```javascript
const targetImagePath = 'target_images/your_image.png';
```

### 4. Run the Generator
```bash
node gemini_only_orchestrator.js
```

## How It Works

### Workflow
1. **Initial Generation**: Gemini creates P5.js code based on the target image
2. **Screenshot**: System captures the rendered result
3. **Visual Analysis**: Gemini compares target vs generated images
4. **Improvement**: Gemini generates specific improvement instructions
5. **Code Update**: New P5.js code is generated incorporating feedback
6. **Iteration**: Process repeats for up to 10 iterations

### Key Components

- **`gemini_only_orchestrator.js`**: Main workflow orchestration
- **`lib/geminiCodeGenerator.js`**: Handles all Gemini API interactions
- **`lib/capture.js`**: Screenshots P5.js sketches using Puppeteer
- **`lib/errorDetector.js`**: Detects and helps fix JavaScript errors
- **`utils/server.js`**: Serves P5.js sketches for screenshot capture

### Session Output
Each run creates a session folder in `sessions/` containing:
- `iterationX.html` - Generated P5.js code for each iteration
- `iterationX.png` - Screenshots of each iteration
- `iterationX_analysis.json` - Gemini's visual analysis
- `session_summary.json` - Complete session metadata
- `target.png` - Copy of the target image

## Configuration

### Iteration Settings
Edit `gemini_only_orchestrator.js`:
```javascript
this.maxIterations = 10;        // Maximum iterations
this.maxFixAttempts = 3;        // Error fix attempts per iteration
```

### Gemini Model
The system uses `gemini-1.5-pro` by default. To change models, edit `lib/geminiCodeGenerator.js`:
```javascript
models/gemini-1.5-pro:generateContent    // Current
models/gemini-1.5-flash:generateContent  // Alternative (faster, lower quality)
```

## API Limits

**Gemini Free Tier**:
- 15 requests per minute
- 1,500 requests per day
- Separate quotas for different models (Pro vs Flash)

## Troubleshooting

### Common Issues

1. **Chrome Not Found**
   - Update Chrome executable path in `lib/capture.js` and `lib/errorDetector.js`
   - Windows: `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`
   - Mac: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

2. **Server Connection Errors**
   - Ensure `node utils/server.js` is running
   - Check port 3000 is available

3. **API Rate Limits**
   - Wait for quota reset (daily/hourly)
   - Switch between Gemini models (Pro/Flash have separate quotas)

4. **Puppeteer Errors**
   - Install Chrome browser
   - Check Chrome executable permissions

### Debug Mode
Enable verbose logging by editing error handling sections in the orchestrator.

## Examples

The system works best with:
- **Geometric compositions** (Mondrian-style)
- **Simple color palettes** 
- **Clear structural elements**
- **Abstract art with distinct shapes**

## Contributing

1. Fork the repository
2. Create feature branch
3. Test with multiple target images
4. Submit pull request

## License

MIT License - see LICENSE file for details.

## Credits

- **Google Gemini**: AI model for visual analysis and code generation
- **P5.js**: Creative coding framework
- **Puppeteer**: Headless browser automation
- **Express**: Web server framework
