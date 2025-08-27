const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const UniversalOrchestrator = require('./universalOrchestrator');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files for frontend

// Store active sessions
const activeSessions = new Map();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create uploads directory if it doesn't exist
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        cb(null, `${name}_${timestamp}${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Only allow image files
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

/**
 * POST /api/sessions/create
 * Create a new generation session
 */
app.post('/api/sessions/create', upload.single('targetImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No target image uploaded' });
        }

        // Parse configuration from request body
        const config = {
            maxIterations: parseInt(req.body.maxIterations) || 5,
            targetScore: parseInt(req.body.targetScore) || 15,
            evaluationMode: req.body.evaluationMode || 'self',
            customPrompts: req.body.customPrompts ? JSON.parse(req.body.customPrompts) : {}
        };

        // Validate configuration
        if (config.maxIterations < 1 || config.maxIterations > 7) {
            return res.status(400).json({ error: 'maxIterations must be between 1 and 7' });
        }
        if (config.targetScore < 1 || config.targetScore > 20) {
            return res.status(400).json({ error: 'targetScore must be between 1 and 20' });
        }
        if (!['self', 'dual'].includes(config.evaluationMode)) {
            return res.status(400).json({ error: 'evaluationMode must be "self" or "dual"' });
        }

        // Create session ID
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Initialize orchestrator
        const orchestrator = new UniversalOrchestrator(config);
        
        // Store session info
        const sessionInfo = {
            id: sessionId,
            orchestrator: orchestrator,
            config: config,
            targetImagePath: req.file.path,
            status: 'created',
            progress: {
                currentIteration: 0,
                totalIterations: config.maxIterations,
                bestScore: 0,
                targetScore: config.targetScore,
                isComplete: false,
                iterations: []
            },
            createdAt: new Date().toISOString()
        };
        
        activeSessions.set(sessionId, sessionInfo);

        res.json({
            sessionId: sessionId,
            config: config,
            status: 'created',
            message: 'Session created successfully. Use /api/sessions/:id/start to begin generation.'
        });

    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/sessions/:id/start
 * Start the generation process for a session
 */
app.post('/api/sessions/:id/start', async (req, res) => {
    try {
        const sessionId = req.params.id;
        const sessionInfo = activeSessions.get(sessionId);

        if (!sessionInfo) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (sessionInfo.status === 'running') {
            return res.status(400).json({ error: 'Session is already running' });
        }

        if (sessionInfo.status === 'completed') {
            return res.status(400).json({ error: 'Session is already completed' });
        }

        // Update session status
        sessionInfo.status = 'running';
        sessionInfo.startedAt = new Date().toISOString();

        res.json({
            sessionId: sessionId,
            status: 'started',
            message: 'Generation started. Use /api/sessions/:id/progress to monitor progress.'
        });

        // Start generation in background
        generateInBackground(sessionId, sessionInfo);

    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/sessions/:id/progress
 * Get current progress of a session
 */
app.get('/api/sessions/:id/progress', (req, res) => {
    try {
        const sessionId = req.params.id;
        const sessionInfo = activeSessions.get(sessionId);

        if (!sessionInfo) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json({
            sessionId: sessionId,
            status: sessionInfo.status,
            progress: sessionInfo.progress,
            config: sessionInfo.config,
            createdAt: sessionInfo.createdAt,
            startedAt: sessionInfo.startedAt,
            completedAt: sessionInfo.completedAt
        });

    } catch (error) {
        console.error('Error getting progress:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/sessions/:id/results
 * Get final results and files for a completed session
 */
app.get('/api/sessions/:id/results', (req, res) => {
    try {
        const sessionId = req.params.id;
        const sessionInfo = activeSessions.get(sessionId);

        if (!sessionInfo) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (sessionInfo.status !== 'completed') {
            return res.status(400).json({ error: 'Session is not completed yet' });
        }

        // Include file paths for downloading
        const results = {
            sessionId: sessionId,
            status: sessionInfo.status,
            progress: sessionInfo.progress,
            config: sessionInfo.config,
            results: sessionInfo.results,
            files: {
                sessionDirectory: sessionInfo.results?.sessionInfo?.sessionDir,
                targetImage: sessionInfo.results?.sessionInfo?.targetPath,
                bestIteration: sessionInfo.progress.bestIteration,
                summary: sessionInfo.results?.summary
            }
        };

        res.json(results);

    } catch (error) {
        console.error('Error getting results:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/sessions/:id/files/:filename
 * Serve session files (images, code, etc.)
 */
app.get('/api/sessions/:id/files/:filename', (req, res) => {
    try {
        const sessionId = req.params.id;
        const filename = req.params.filename;
        const sessionInfo = activeSessions.get(sessionId);

        if (!sessionInfo) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (!sessionInfo.results?.sessionInfo?.sessionDir) {
            return res.status(404).json({ error: 'Session directory not found' });
        }

        const filePath = path.join(sessionInfo.results.sessionInfo.sessionDir, filename);
        
        // Security check - ensure file is within session directory
        const normalizedPath = path.normalize(filePath);
        const sessionDir = path.normalize(sessionInfo.results.sessionInfo.sessionDir);
        
        if (!normalizedPath.startsWith(sessionDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.sendFile(path.resolve(filePath));

    } catch (error) {
        console.error('Error serving file:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/sessions
 * List all sessions (for debugging/admin)
 */
app.get('/api/sessions', (req, res) => {
    try {
        const sessions = Array.from(activeSessions.entries()).map(([id, info]) => ({
            sessionId: id,
            status: info.status,
            config: info.config,
            createdAt: info.createdAt,
            progress: {
                currentIteration: info.progress.currentIteration,
                totalIterations: info.progress.totalIterations,
                bestScore: info.progress.bestScore,
                targetScore: info.progress.targetScore,
                isComplete: info.progress.isComplete
            }
        }));

        res.json({ sessions });

    } catch (error) {
        console.error('Error listing sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/sessions/:id
 * Clean up a session and its files
 */
app.delete('/api/sessions/:id', (req, res) => {
    try {
        const sessionId = req.params.id;
        const sessionInfo = activeSessions.get(sessionId);

        if (!sessionInfo) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Clean up uploaded file
        if (sessionInfo.targetImagePath && fs.existsSync(sessionInfo.targetImagePath)) {
            fs.unlinkSync(sessionInfo.targetImagePath);
        }

        // Remove from active sessions
        activeSessions.delete(sessionId);

        res.json({
            sessionId: sessionId,
            message: 'Session deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Background generation function
 */
async function generateInBackground(sessionId, sessionInfo) {
    try {
        console.log(`Starting background generation for session ${sessionId}`);
        
        // Progress callback to update session state
        const progressCallback = (progress) => {
            sessionInfo.progress = {
                ...sessionInfo.progress,
                currentIteration: progress.iteration || sessionInfo.progress.currentIteration,
                status: progress.status || 'running',
                bestScore: progress.bestScore || sessionInfo.progress.bestScore,
                lastUpdate: new Date().toISOString()
            };

            // Add iteration data if available
            if (progress.iteration && progress.score !== undefined) {
                const existingIndex = sessionInfo.progress.iterations.findIndex(
                    iter => iter.iteration === progress.iteration
                );
                
                const iterationData = {
                    iteration: progress.iteration,
                    score: progress.score,
                    status: progress.status,
                    feedback: progress.feedback?.substring(0, 200) + '...' || '',
                    timestamp: new Date().toISOString()
                };

                if (existingIndex >= 0) {
                    sessionInfo.progress.iterations[existingIndex] = iterationData;
                } else {
                    sessionInfo.progress.iterations.push(iterationData);
                }
            }

            console.log(`Session ${sessionId} progress:`, progress);
        };

        // Run the orchestrator
        const results = await sessionInfo.orchestrator.runSession(
            sessionInfo.targetImagePath,
            progressCallback
        );

        // Update session with results
        sessionInfo.status = 'completed';
        sessionInfo.completedAt = new Date().toISOString();
        sessionInfo.results = results;
        sessionInfo.progress.isComplete = true;
        sessionInfo.progress.bestScore = results.bestScore;
        sessionInfo.progress.bestIteration = results.bestIteration;

        console.log(`Session ${sessionId} completed successfully`);

    } catch (error) {
        console.error(`Session ${sessionId} failed:`, error);
        sessionInfo.status = 'failed';
        sessionInfo.error = error.message;
        sessionInfo.completedAt = new Date().toISOString();
    }
}

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
        }
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Web API server running on port ${PORT}`);
    console.log(`Upload endpoint: http://localhost:${PORT}/api/sessions/create`);
    console.log(`Make sure the sketch server is running on port 3000`);
});

module.exports = app;
