/**
 * Claude Desktop API Server
 * HTTP/WebSocket interface for Python bridge integration
 * Professional microservice architecture replacing subprocess calls
 */

const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const { ClaudeDesktopInterface } = require('./src/claude_desktop_interface.js');
const { extractContentSimple } = require('./src/simple-extraction.js');
const SimpleWebSocketExtractor = require('./src/simple-extractor.js');

class ClaudeDesktopAPIServer {
    constructor(config = {}) {
        this.config = {
            httpPort: config.httpPort || 3000,
            chromeDebugPort: config.chromeDebugPort || 9223,
            corsOrigin: config.corsOrigin || "*",
            ...config
        };
        
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new SocketIOServer(this.server, {
            cors: {
                origin: this.config.corsOrigin,
                methods: ["GET", "POST"]
            }
        });
        
        this.claude = null;
        this.simpleExtractor = new SimpleWebSocketExtractor(this.config.chromeDebugPort);
        this.isInitialized = false;
        this.connectedClients = new Set();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.setupErrorHandling();
    }
    
    setupMiddleware() {
        // CORS support
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', this.config.corsOrigin);
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });
        
        // JSON parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.path}`);
            next();
        });
    }
    
    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                initialized: this.isInitialized,
                timestamp: Date.now(),
                connectedClients: this.connectedClients.size
            });
        });
        
        // Claude Desktop interface initialization
        this.app.post('/claude/initialize', async (req, res) => {
            try {
                if (!this.claude) {
                    this.claude = new ClaudeDesktopInterface({
                        chromeDebugPort: this.config.chromeDebugPort
                    });
                }
                
                if (!this.isInitialized) {
                    await this.claude.initialize();
                    this.isInitialized = true;
                    console.log('✅ Claude Desktop interface initialized via API');
                }
                
                res.json({
                    success: true,
                    message: 'Claude Desktop interface initialized',
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error('❌ Initialization error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        });
        
        // Message injection endpoint
        this.app.post('/claude/inject', async (req, res) => {
            try {
                await this.ensureInitialized();
                
                const { message, metadata } = req.body;
                if (!message) {
                    return res.status(400).json({
                        success: false,
                        error: 'Message is required',
                        timestamp: Date.now()
                    });
                }
                
                console.log(`📤 Injecting message: ${message.substring(0, 50)}...`);
                
                // Check if new thread is requested - CREATE BEFORE INJECTING
                if (metadata && metadata.new_thread) {
                    console.log('🆕 Creating new conversation thread...');
                    try {
                        await this.claude.createNewChat();
                        console.log('✅ New conversation thread created');
                        // Small delay to ensure chat is ready
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (error) {
                        console.error('❌ Failed to create new thread:', error.message);
                        // Continue with injection anyway
                    }
                }
                
                const result = await this.claude.injectMessage(message);
                
                // Start proactive response monitoring if injection successful
                if (result.success && result.anchor) {
                    this.startProactiveMonitoring(result.anchor);
                }
                
                // Broadcast to WebSocket clients
                this.io.emit('message_injected', {
                    success: result.success,
                    anchor: result.anchor,
                    message: message.substring(0, 100),
                    metadata,
                    timestamp: Date.now()
                });
                
                res.json({
                    success: result.success,
                    anchor: result.anchor,
                    method: result.method,
                    error: result.error,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error('❌ Message injection error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        });
        
        // Content extraction endpoint
        this.app.get('/claude/extract', async (req, res) => {
            try {
                await this.ensureInitialized();
                
                const options = {
                    waitForComplete: req.query.waitForComplete !== 'false',
                    timeout: parseInt(req.query.timeout) || 15000
                };
                
                console.log('📥 Extracting Claude response...');
                
                // Use the exact same extraction logic as the working original
                const result = await extractContentSimple(this.config.chromeDebugPort);
                
                // Broadcast to WebSocket clients
                this.io.emit('content_extracted', {
                    success: result.success,
                    content: result.content,
                    contentLength: result.contentLength,
                    complete: result.complete,
                    timestamp: Date.now()
                });
                
                res.json({
                    success: result.success,
                    content: result.content,
                    complete: result.complete,
                    contentLength: result.contentLength,
                    elapsed: result.elapsed,
                    error: result.error,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error('❌ Content extraction error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        });
        
        // Response monitoring endpoint
        this.app.post('/claude/monitor', async (req, res) => {
            try {
                await this.ensureInitialized();
                
                const { anchor, timeout, streaming = false } = req.body;
                if (!anchor) {
                    return res.status(400).json({
                        success: false,
                        error: 'Anchor hash is required',
                        timestamp: Date.now()
                    });
                }
                
                console.log(`🔍 Monitoring for response with anchor: ${anchor} Streaming: ${streaming}`);
                
                // Create streaming callback if requested
                let streamCallback = null;
                if (streaming) {
                    streamCallback = (update) => {
                        // Emit streaming updates via WebSocket
                        packet = {
                            anchor: anchor,
                            content: update.content,
                            complete: update.complete,
                            timestamp: update.timestamp
                        }
                        console.log('response_streaming', packet);
                        this.io.emit('response_streaming', packet);
                    };
                }
                
                const result = await this.claude.monitorForResponse(anchor, timeout, streamCallback);
                
                // Broadcast final result to WebSocket clients
                this.io.emit('response_monitored', {
                    success: result.success,
                    anchor: anchor,
                    complete: result.complete,
                    contentLength: result.contentLength,
                    timestamp: Date.now()
                });
                
                let retval = {
                    success: result.success,
                    content: result.content,
                    complete: result.complete,
                    contentLength: result.contentLength,
                    elapsed: result.elapsed,
                    error: result.error,
                    timestamp: Date.now()
                }
                console.log(retval);
                res.json(retval);
                
            } catch (error) {
                console.error('❌ Response monitoring error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        });
        
        // Desktop state endpoints
        this.app.get('/claude/state', async (req, res) => {
            try {
                await this.ensureInitialized();
                
                const state = await this.claude.getDesktopState();
                
                res.json({
                    success: true,
                    state: state,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error('❌ State retrieval error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        });
        
        // Chat management endpoints
        this.app.post('/claude/chat/new', async (req, res) => {
            try {
                await this.ensureInitialized();
                
                console.log('🆕 Creating new chat...');
                
                const result = await this.claude.createNewChat();
                
                this.io.emit('chat_created', {
                    success: result.success,
                    chatId: result.chatId,
                    timestamp: Date.now()
                });
                
                res.json({
                    success: result.success,
                    chatId: result.chatId,
                    method: result.method,
                    error: result.error,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error('❌ Chat creation error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        });
        
        // Combined workflow endpoint - inject and monitor
        this.app.post('/claude/send', async (req, res) => {
            try {
                await this.ensureInitialized();
                
                const { message, waitForResponse, timeout, metadata } = req.body;
                if (!message) {
                    return res.status(400).json({
                        success: false,
                        error: 'Message is required',
                        timestamp: Date.now()
                    });
                }
                
                console.log(`🚀 Sending message with response monitoring: ${message.substring(0, 50)}...`);
                
                // Inject message
                const injectionResult = await this.claude.injectMessage(message);
                
                if (!injectionResult.success) {
                    return res.json({
                        success: false,
                        error: injectionResult.error,
                        stage: 'injection',
                        timestamp: Date.now()
                    });
                }
                
                // If waitForResponse is false, return immediately
                if (waitForResponse === false) {
                    return res.json({
                        success: true,
                        anchor: injectionResult.anchor,
                        stage: 'injection_only',
                        timestamp: Date.now()
                    });
                }
                
                // Monitor for response
                const monitorResult = await this.claude.monitorForResponse(
                    injectionResult.anchor, 
                    timeout || 20000
                );
                
                // Broadcast complete workflow result
                this.io.emit('workflow_complete', {
                    success: monitorResult.success,
                    anchor: injectionResult.anchor,
                    contentLength: monitorResult.contentLength,
                    complete: monitorResult.complete,
                    metadata,
                    timestamp: Date.now()
                });
                
                res.json({
                    success: monitorResult.success,
                    anchor: injectionResult.anchor,
                    content: monitorResult.content,
                    complete: monitorResult.complete,
                    contentLength: monitorResult.contentLength,
                    elapsed: monitorResult.elapsed,
                    error: monitorResult.error,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error('❌ Send workflow error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    stage: 'workflow',
                    timestamp: Date.now()
                });
            }
        });
    }
    
    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log(`🔌 WebSocket client connected: ${socket.id}`);
            this.connectedClients.add(socket.id);
            
            // Send initial status
            socket.emit('server_status', {
                initialized: this.isInitialized,
                connectedClients: this.connectedClients.size,
                timestamp: Date.now()
            });
            
            // Handle disconnection
            socket.on('disconnect', () => {
                console.log(`🔌 WebSocket client disconnected: ${socket.id}`);
                this.connectedClients.delete(socket.id);
            });
            
            // Handle ping requests
            socket.on('ping', () => {
                socket.emit('pong', { timestamp: Date.now() });
            });
        });
        
        // Broadcast state changes to all clients
        if (this.claude) {
            this.claude.on('stateChange', (stateData) => {
                this.io.emit('state_change', stateData);
            });
        }
    }
    
    setupErrorHandling() {
        // Handle unmatched routes
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: `Route not found: ${req.method} ${req.originalUrl}`,
                timestamp: Date.now()
            });
        });
        
        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('🔥 Unhandled API error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                timestamp: Date.now()
            });
        });
    }
    
    /**
     * Start proactive monitoring for response after message injection
     */
    startProactiveMonitoring(anchor) {
        // Avoid duplicate monitoring for the same anchor
        if (this.activeMonitoring && this.activeMonitoring.has(anchor)) {
            return;
        }
        
        if (!this.activeMonitoring) {
            this.activeMonitoring = new Set();
        }
        
        this.activeMonitoring.add(anchor);
        console.log(`🔍 Starting proactive monitoring for anchor: ${anchor}`);
        
        // Monitor for response completion
        const monitorInterval = setInterval(async () => {
            try {
                const result = await extractContentSimple(this.config.chromeDebugPort);
                
                if (result.success && result.content) {
                    // Emit real-time content updates
                    this.io.emit('response_update', {
                        anchor: anchor,
                        content: result.content,
                        contentLength: result.contentLength,
                        complete: result.complete,
                        timestamp: Date.now()
                    });
                    
                    // If response is complete, stop monitoring
                    if (result.complete) {
                        console.log(`✅ Response complete for anchor: ${anchor}. Sent ${result.contentLength} characters`);
                        clearInterval(monitorInterval);
                        this.activeMonitoring.delete(anchor);
                        
                        // Final complete event
                        this.io.emit('response_complete', {
                            anchor: anchor,
                            content: result.content,
                            contentLength: result.contentLength,
                            timestamp: Date.now()
                        });
                    }
                }
            } catch (error) {
                console.error(`❌ Monitoring error for ${anchor}:`, error.message);
            }
        }, 5000); // Check every 5 seconds - increased since we now have proper completion detection
        
        // Auto-cleanup after 3 minutes
        setTimeout(() => {
            clearInterval(monitorInterval);
            this.activeMonitoring.delete(anchor);
            console.log(`⏰ Monitoring timeout for anchor: ${anchor}`);
        }, 180000);
    }

    async ensureInitialized() {
        if (!this.claude) {
            this.claude = new ClaudeDesktopInterface({
                chromeDebugPort: this.config.chromeDebugPort
            });
        }
        
        if (!this.isInitialized) {
            await this.claude.initialize();
            this.isInitialized = true;
            console.log('✅ Claude Desktop interface auto-initialized');
        }
    }
    
    async start() {
        return new Promise((resolve, reject) => {
            this.server.listen(this.config.httpPort, (error) => {
                if (error) {
                    console.error('❌ Failed to start API server:', error);
                    reject(error);
                } else {
                    console.log(`🚀 Claude Desktop API Server started`);
                    console.log(`📡 HTTP API: http://localhost:${this.config.httpPort}`);
                    console.log(`🔌 WebSocket: ws://localhost:${this.config.httpPort}`);
                    console.log(`🏥 Health check: http://localhost:${this.config.httpPort}/health`);
                    resolve();
                }
            });
        });
    }
    
    async stop() {
        return new Promise((resolve) => {
            this.server.close(() => {
                console.log('🛑 Claude Desktop API Server stopped');
                if (this.claude) {
                    this.claude.cleanup();
                }
                resolve();
            });
        });
    }
}

// Export the server class
module.exports = ClaudeDesktopAPIServer;

// If run directly, start the server
if (require.main === module) {
    const server = new ClaudeDesktopAPIServer({
        httpPort: process.env.PORT || 3000,
        chromeDebugPort: process.env.CHROME_DEBUG_PORT || 9223
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down API server...');
        await server.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        console.log('\n🛑 Terminating API server...');
        await server.stop();
        process.exit(0);
    });
    
    // Start the server
    server.start().catch(error => {
        console.error('💥 Failed to start server:', error);
        process.exit(1);
    });
}
