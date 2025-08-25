# Agentic P5.js Art Generator Blueprint

## Overview
An agentic workflow that uses Claude 3.5 to generate P5.js code attempting to reproduce target images, with a smaller evaluation LLM providing feedback for iterative improvement.

## Current Setup

### Working Components
- **Express Server** (`server.js`) - Serves P5.js sketches locally on port 3000
- **Screenshot Capture** (`capture.js`) - Puppeteer-based canvas screenshot system
- **Test Sketch** (`test-sketch.html`) - Working Mondrian-style geometric composition
- **File Structure** - Organized directories for iterations, screenshots, target images

### Dependencies
- express ^5.1.0
- playwright ^1.55.0
- puppeteer-core ^24.17.0

## Missing Components

### 1. Main Orchestrator
**Purpose**: Coordinates the entire workflow
**Functions**:
- Load target image
- Run iteration loop (max 7 attempts)
- Call Claude 3.5 for P5.js code generation
- Capture screenshots of generated sketches
- Call evaluation LLM for similarity scoring
- Stop when score >= 7/10 or max iterations reached
- Save all iterations with metadata

### 2. Claude 3.5 Integration
**Purpose**: Generate P5.js code from image descriptions
**Requirements**:
- API integration with Anthropic
- Prompting system for P5.js code generation
- Context about P5.js capabilities and canvas constraints
- Image-to-code translation logic

### 3. Image Evaluation LLM
**Purpose**: Compare generated images to target and provide scoring
**Requirements**:
- Smaller, specialized model for image comparison
- Takes original + generated images as input
- Returns detailed difference analysis
- Provides numerical similarity score (0-10)

### 4. Enhanced Storage System
**Purpose**: Organize and save iteration data
**Structure**:
```
iterations/
  session_[timestamp]/
    target_image.png
    iteration_001/
      code.html
      screenshot.png
      evaluation.json
    iteration_002/
      ...
```

## Workflow Process

1. **Initialize**
   - Load target image
   - Create session directory
   - Initialize iteration counter

2. **Generate Loop** (max 7 iterations)
   - Send target image + previous feedback to Claude 3.5
   - Generate P5.js code
   - Save code to HTML file
   - Capture screenshot via Puppeteer
   - Send both images to evaluation LLM
   - Get similarity score and feedback
   - Save iteration data
   - Check stopping criteria

3. **Stopping Criteria**
   - Score >= 7/10 similarity, OR
   - Reached 7 iterations

4. **Output**
   - Best iteration based on highest score
   - Complete session data saved

## Implementation Priority

1. Add sample target images
2. Create main orchestrator structure
3. Integrate Claude 3.5 API
4. Add evaluation LLM integration
5. Implement enhanced storage system
6. Test complete workflow

## Configuration

### Similarity Threshold
- Current: 7/10
- Configurable for different studies

### Max Iterations
- Current: 7
- Configurable for experimentation

### Agent Knowledge
- Variable: How much the agent knows about the evaluation process
- Study parameter: Agent awareness of scoring criteria
