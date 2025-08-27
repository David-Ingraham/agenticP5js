/**
 * Security utilities for input validation and prompt injection protection
 */

class SecurityValidator {
    constructor() {
        // Dangerous patterns that could indicate prompt injection
        this.PROMPT_INJECTION_PATTERNS = [
            // Direct instruction attempts
            /ignore\s+(previous|above|all)\s+(instructions?|prompts?|commands?)/i,
            /forget\s+(everything|all|previous)/i,
            /new\s+(instructions?|task|prompt)/i,
            /system\s*[:]\s*/i,
            /assistant\s*[:]\s*/i,
            /human\s*[:]\s*/i,
            /user\s*[:]\s*/i,
            
            // Role hijacking attempts
            /you\s+are\s+now/i,
            /act\s+as\s+a/i,
            /pretend\s+to\s+be/i,
            /roleplay\s+as/i,
            
            // Information extraction attempts
            /what\s+(is\s+your|are\s+your)\s+(instructions?|prompts?|system)/i,
            /show\s+me\s+your\s+(instructions?|prompts?)/i,
            /repeat\s+your\s+(instructions?|prompts?)/i,
            /tell\s+me\s+your\s+(instructions?|prompts?)/i,
            
            // Code injection attempts
            /<script/i,
            /javascript:/i,
            /eval\s*\(/i,
            /function\s*\(/i,
            /=>\s*{/i,
            
            // Markdown/HTML injection
            /\[.*\]\(.*javascript:/i,
            /<iframe/i,
            /<object/i,
            /<embed/i,
            
            // Encoding attacks
            /&#x?[0-9a-f]+;/i,
            /%[0-9a-f]{2}/i,
            
            // SQL injection patterns (though we don't use SQL, good to block)
            /union\s+select/i,
            /drop\s+table/i,
            /insert\s+into/i,
            /delete\s+from/i,
            
            // System command attempts
            /\$\{.*\}/,
            /`.*`/,
            /exec\(/i,
            /spawn\(/i,
            /system\(/i,
            
            // Excessive repetition (DDoS via prompt length)
            /(.{1,10})\1{20,}/,
            
            // Suspicious character sequences
            /[^\x20-\x7E\n\r\t]/g, // Non-printable ASCII except newlines and tabs
        ];
        
        // Maximum allowed character limits
        this.MAX_LENGTHS = {
            customPrompt: 800,
            customEvalPrompt: 500,
            sessionId: 100,
            filename: 255
        };
        
        // Allowed file types
        this.ALLOWED_MIME_TYPES = [
            'image/jpeg',
            'image/png', 
            'image/gif',
            'image/webp',
            'image/bmp'
        ];
        
        // Rate limiting windows (in milliseconds)
        this.RATE_LIMITS = {
            sessionCreation: 60000, // 1 minute between sessions per IP
            fileUpload: 30000,      // 30 seconds between uploads per IP
            maxConcurrentSessions: 3 // Max concurrent sessions per IP
        };
        
        this.ipTracking = new Map(); // Track IP addresses for rate limiting
    }
    
    /**
     * Validate and sanitize a text input
     */
    validateTextInput(input, type, options = {}) {
        const result = {
            isValid: true,
            sanitized: input,
            errors: []
        };
        
        // Null/undefined check
        if (input === null || input === undefined) {
            if (options.required) {
                result.isValid = false;
                result.errors.push(`${type} is required`);
            }
            result.sanitized = '';
            return result;
        }
        
        // Convert to string and trim
        let sanitized = String(input).trim();
        
        // Length validation
        const maxLength = this.MAX_LENGTHS[type] || 1000;
        if (sanitized.length > maxLength) {
            result.isValid = false;
            result.errors.push(`${type} exceeds maximum length of ${maxLength} characters`);
            sanitized = sanitized.substring(0, maxLength);
        }
        
        // Check for prompt injection patterns
        const injectionResults = this.detectPromptInjection(sanitized);
        if (!injectionResults.isSafe) {
            result.isValid = false;
            result.errors.push(`${type} contains potentially dangerous patterns: ${injectionResults.violations.join(', ')}`);
            // Don't return the sanitized version if injection detected
            result.sanitized = '';
            return result;
        }
        
        // Basic sanitization - remove null bytes, control chars (except newlines/tabs)
        sanitized = sanitized
            .replace(/\0/g, '') // Remove null bytes
            .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control chars except \n\t\r
        
        // Specific sanitization based on type
        if (type === 'sessionId') {
            // Session IDs should only contain alphanumeric, underscore, hyphen
            sanitized = sanitized.replace(/[^a-zA-Z0-9_-]/g, '');
        } else if (type === 'filename') {
            // Filenames - remove path traversal attempts and dangerous chars
            sanitized = sanitized
                .replace(/\.\./g, '') // Remove path traversal
                .replace(/[<>:"|?*]/g, '') // Remove dangerous filename chars
                .replace(/^\.+/, ''); // Remove leading dots
        }
        
        result.sanitized = sanitized;
        return result;
    }
    
    /**
     * Detect potential prompt injection attempts
     */
    detectPromptInjection(text) {
        const violations = [];
        
        for (const pattern of this.PROMPT_INJECTION_PATTERNS) {
            if (pattern.test(text)) {
                violations.push(pattern.source);
            }
        }
        
        // Check for excessive repetition
        const repetitionMatch = text.match(/(.{1,10})\1{10,}/);
        if (repetitionMatch) {
            violations.push('excessive_repetition');
        }
        
        // Check for very long single words (potential overflow attacks)
        const longWords = text.split(/\s+/).filter(word => word.length > 100);
        if (longWords.length > 0) {
            violations.push('extremely_long_words');
        }
        
        return {
            isSafe: violations.length === 0,
            violations: violations
        };
    }
    
    /**
     * Validate file upload
     */
    validateFileUpload(file, ip) {
        const result = {
            isValid: true,
            errors: []
        };
        
        // Check file exists
        if (!file) {
            result.isValid = false;
            result.errors.push('No file provided');
            return result;
        }
        
        // Check file type
        if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            result.isValid = false;
            result.errors.push(`Invalid file type. Allowed: ${this.ALLOWED_MIME_TYPES.join(', ')}`);
        }
        
        // Check file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
            result.isValid = false;
            result.errors.push('File size exceeds 10MB limit');
        }
        
        // Validate filename
        const filenameValidation = this.validateTextInput(file.originalname, 'filename');
        if (!filenameValidation.isValid) {
            result.isValid = false;
            result.errors.push(...filenameValidation.errors);
        }
        
        // Rate limiting check
        const rateLimitResult = this.checkRateLimit(ip, 'fileUpload');
        if (!rateLimitResult.allowed) {
            result.isValid = false;
            result.errors.push('Upload rate limit exceeded. Please wait before uploading again.');
        }
        
        return result;
    }
    
    /**
     * Check rate limiting for an IP address
     */
    checkRateLimit(ip, action) {
        if (!ip) return { allowed: true }; // Allow if no IP (for local testing)
        
        const now = Date.now();
        const limit = this.RATE_LIMITS[action];
        
        if (!this.ipTracking.has(ip)) {
            this.ipTracking.set(ip, {});
        }
        
        const ipData = this.ipTracking.get(ip);
        
        // Check specific action rate limit
        if (ipData[action] && (now - ipData[action]) < limit) {
            return { 
                allowed: false, 
                retryAfter: Math.ceil((limit - (now - ipData[action])) / 1000)
            };
        }
        
        // Check concurrent sessions
        if (action === 'sessionCreation') {
            const activeSessions = ipData.activeSessions || 0;
            if (activeSessions >= this.RATE_LIMITS.maxConcurrentSessions) {
                return { 
                    allowed: false, 
                    reason: 'Maximum concurrent sessions exceeded'
                };
            }
        }
        
        // Update tracking
        ipData[action] = now;
        return { allowed: true };
    }
    
    /**
     * Track session creation/completion for rate limiting
     */
    trackSession(ip, action) {
        if (!ip) return;
        
        if (!this.ipTracking.has(ip)) {
            this.ipTracking.set(ip, {});
        }
        
        const ipData = this.ipTracking.get(ip);
        
        if (action === 'start') {
            ipData.activeSessions = (ipData.activeSessions || 0) + 1;
        } else if (action === 'end') {
            ipData.activeSessions = Math.max((ipData.activeSessions || 0) - 1, 0);
        }
    }
    
    /**
     * Clean up old tracking data (call periodically)
     */
    cleanupTracking() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const [ip, data] of this.ipTracking.entries()) {
            const lastActivity = Math.max(...Object.values(data).filter(v => typeof v === 'number'));
            if (now - lastActivity > maxAge) {
                this.ipTracking.delete(ip);
            }
        }
    }
    
    /**
     * Generate secure session ID
     */
    generateSecureSessionId() {
        const timestamp = Date.now();
        const random = require('crypto').randomBytes(16).toString('hex');
        return `session_${timestamp}_${random}`;
    }
    
    /**
     * Validate complete request configuration
     */
    validateSessionConfig(config, ip) {
        const result = {
            isValid: true,
            sanitized: {},
            errors: []
        };
        
        // Validate each field
        const fields = [
            { key: 'customPrompt', type: 'customPrompt', required: false },
            { key: 'customEvalPrompt', type: 'customEvalPrompt', required: false },
            { key: 'evaluationMode', type: 'evaluationMode', required: true }
        ];
        
        for (const field of fields) {
            const validation = this.validateTextInput(config[field.key], field.type, { required: field.required });
            if (!validation.isValid) {
                result.isValid = false;
                result.errors.push(...validation.errors);
            }
            result.sanitized[field.key] = validation.sanitized;
        }
        
        // Validate numeric fields
        const maxIterations = parseInt(config.maxIterations);
        if (isNaN(maxIterations) || maxIterations < 1 || maxIterations > 7) {
            result.isValid = false;
            result.errors.push('maxIterations must be between 1 and 7');
        } else {
            result.sanitized.maxIterations = maxIterations;
        }
        
        const targetScore = parseInt(config.targetScore);
        if (isNaN(targetScore) || targetScore < 1 || targetScore > 20) {
            result.isValid = false;
            result.errors.push('targetScore must be between 1 and 20');
        } else {
            result.sanitized.targetScore = targetScore;
        }
        
        // Validate evaluation mode
        if (!['self', 'dual'].includes(result.sanitized.evaluationMode)) {
            result.isValid = false;
            result.errors.push('evaluationMode must be "self" or "dual"');
        }
        
        // Check session creation rate limit
        const rateLimitResult = this.checkRateLimit(ip, 'sessionCreation');
        if (!rateLimitResult.allowed) {
            result.isValid = false;
            result.errors.push('Session creation rate limit exceeded. Please wait before creating another session.');
        }
        
        return result;
    }
}

module.exports = SecurityValidator;
