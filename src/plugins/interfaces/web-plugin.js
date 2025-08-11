/**
 * Web Plugin - HTTP/WebSocket Interface Implementation
 * 
 * Provides a web-based interface for Claude Desktop bridge.
 * Supports both HTTP REST API and WebSocket real-time communication.
 * 
 * @author AI Collaboration
 * @version 2.0.0
 * @date August 9, 2025
 */

const BasePlugin = require('../base-plugin');
const http = require('http');
const WebSocket = require('ws');

class WebPlugin extends BasePlugin {
    constructor(config = {}) {
        super(config);
        
        // Plugin metadata
        this.name = 'web-interface';
        this.version = '2.0.0';
        this.description = 'HTTP/WebSocket interface for Claude Desktop bridge';
        
        // Web-specific configuration
        this.webConfig = {
            httpPort: 3001,
            wsPort: 3002,
            enableCors: true,
            corsOrigin: '*',
            enableWebSocket: true,
            maxConnections: 100,
            messageTimeout: 30000,
            ...config.web
        };
        
        // Servers
        this.httpServer = null;
        this.wsServer = null;
        
        // WebSocket connections
        this.wsConnections = new Map(); // connectionId -> { ws, metadata }
        this.connectionCounter = 0;
        
        // Active requests
        this.activeRequests = new Map(); // requestId -> { resolve, reject, timeout }
        
        this.log('WebPlugin initialized');
    }
    
    /**
     * Initialize the Web plugin
     */
    async _doInitialize() {
        this.log('Web plugin validation complete');
    }
    
    /**
     * Start the Web plugin
     */
    async _doStart() {
        // Start HTTP server
        await this._startHttpServer();
        
        // Start WebSocket server if enabled
        if (this.webConfig.enableWebSocket) {
            await this._startWebSocketServer();
        }
        
        this.log(`Web plugin ready - HTTP: ${this.webConfig.httpPort}, WS: ${this.webConfig.wsPort}`);
    }
    
    /**
     * Stop the Web plugin
     */
    async _doStop() {
        // Close WebSocket server
        if (this.wsServer) {
            this.wsServer.close();
            this.wsServer = null;
        }
        
        // Close HTTP server
        if (this.httpServer) {
            await new Promise((resolve) => {
                this.httpServer.close(() => {
                    this.log('HTTP server stopped');
                    resolve();
                });
            });
            this.httpServer = null;
        }
        
        // Clear connections
        this.wsConnections.clear();
        this.activeRequests.clear();
    }
    
    /**
     * Handle incoming web message
     */
    async _doHandleMessage(message, context) {
        const { content, requestId, format = 'json' } = message;
        
        if (!content || content.trim() === '') {
            throw new Error('Empty message content');
        }
        
        this.log(`Processing web message: "${content.substring(0, 50)}..."`);
        
        try {
            // Process through bridge core
            const result = await this.processMessage(content, {
                format: 'web',
                source: this.name,
                contextData: {
                    requestId,
                    format,
                    timestamp: Date.now()
                }
            });
            
            return {
                success: true,
                requestId,
                response: result.content,
                format: format
            };
            
        } catch (error) {
            this.log(`Web message processing failed: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Send response back via web interface
     */
    async _doSendResponse(response, context) {
        const { requestId, format = 'json', connectionId } = context;
        
        const responseData = {
            success: true,
            requestId,
            response,
            timestamp: Date.now()
        };
        
        // Send via WebSocket if connection exists
        if (connectionId && this.wsConnections.has(connectionId)) {
            const { ws } = this.wsConnections.get(connectionId);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(responseData));
                return { success: true, method: 'websocket' };
            }
        }
        
        // Store for HTTP polling (if applicable)
        return { success: true, method: 'stored', data: responseData };
    }
    
    /**
     * Start HTTP server
     */
    async _startHttpServer() {
        this.httpServer = http.createServer((req, res) => {
            this._handleHttpRequest(req, res);
        });
        
        await new Promise((resolve, reject) => {
            this.httpServer.listen(this.webConfig.httpPort, (error) => {
                if (error) {
                    reject(error);
                } else {
                    this.log(`HTTP server listening on port ${this.webConfig.httpPort}`);
                    resolve();
                }
            });
        });
    }
    
    /**
     * Start WebSocket server
     */
    async _startWebSocketServer() {
        this.wsServer = new WebSocket.Server({ 
            port: this.webConfig.wsPort,
            maxPayload: 1024 * 1024 // 1MB
        });
        
        this.wsServer.on('connection', (ws, req) => {
            this._handleWebSocketConnection(ws, req);
        });
        
        this.wsServer.on('error', (error) => {
            this.log(`WebSocket server error: ${error.message}`);
            this.emit('error', error);
        });
        
        this.log(`WebSocket server listening on port ${this.webConfig.wsPort}`);
    }
    
    /**
     * Handle HTTP requests
     */
    async _handleHttpRequest(req, res) {
        // Set CORS headers
        if (this.webConfig.enableCors) {
            res.setHeader('Access-Control-Allow-Origin', this.webConfig.corsOrigin);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        }
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        const url = new URL(req.url, `http://localhost:${this.webConfig.httpPort}`);
        
        try {
            if (req.method === 'GET' && url.pathname === '/status') {
                await this._handleStatusRequest(req, res);
            } else if (req.method === 'POST' && url.pathname === '/message') {
                await this._handleMessageRequest(req, res);
            } else if (req.method === 'GET' && url.pathname === '/') {
                await this._handleIndexRequest(req, res);
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Endpoint not found' }));
            }
        } catch (error) {
            this.log(`HTTP request handling failed: ${error.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    }
    
    /**
     * Handle WebSocket connections
     */
    _handleWebSocketConnection(ws, req) {
        const connectionId = ++this.connectionCounter;
        const clientIp = req.socket.remoteAddress;
        
        this.log(`WebSocket connection established: ${connectionId} from ${clientIp}`);
        
        // Store connection
        this.wsConnections.set(connectionId, {
            ws,
            metadata: {
                id: connectionId,
                connectedAt: Date.now(),
                clientIp,
                lastActivity: Date.now()
            }
        });
        
        // Send welcome message
        ws.send(JSON.stringify({
            type: 'welcome',
            connectionId,
            message: 'Connected to Claude Desktop Bridge'
        }));
        
        // Handle messages
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await this._handleWebSocketMessage(connectionId, message);
            } catch (error) {
                this.log(`WebSocket message error: ${error.message}`);
                ws.send(JSON.stringify({
                    type: 'error',
                    error: error.message
                }));
            }
        });
        
        // Handle disconnect
        ws.on('close', () => {
            this.log(`WebSocket connection closed: ${connectionId}`);
            this.wsConnections.delete(connectionId);
        });
        
        // Handle errors
        ws.on('error', (error) => {
            this.log(`WebSocket connection error: ${error.message}`);
            this.wsConnections.delete(connectionId);
        });
    }
    
    /**
     * Handle WebSocket messages
     */
    async _handleWebSocketMessage(connectionId, message) {
        const { type, content, requestId } = message;
        
        if (type === 'message' && content) {
            // Process message through bridge
            const result = await this.handleMessage({
                content,
                requestId: requestId || Date.now().toString()
            }, {
                connectionId,
                format: 'json'
            });
            
            // Response is sent automatically via _doSendResponse
        } else if (type === 'ping') {
            // Handle ping
            const connection = this.wsConnections.get(connectionId);
            if (connection) {
                connection.ws.send(JSON.stringify({ type: 'pong' }));
                connection.metadata.lastActivity = Date.now();
            }
        }
    }
    
    /**
     * Handle status requests
     */
    async _handleStatusRequest(req, res) {
        const status = this.getStatus();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
    }
    
    /**
     * Handle message requests
     */
    async _handleMessageRequest(req, res) {
        const body = await this._parseRequestBody(req);
        const { content, format = 'json' } = body;
        
        if (!content) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Content is required' }));
            return;
        }
        
        const requestId = Date.now().toString();
        
        try {
            const result = await this.handleMessage({ content, requestId, format });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    }
    
    /**
     * Handle index page requests
     */
    async _handleIndexRequest(req, res) {
        const html = this._generateIndexPage();
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    }
    
    /**
     * Generate simple index page
     */
    _generateIndexPage() {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Claude Desktop Bridge - Web Interface</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; margin: 0 auto; }
        .api-section { margin: 20px 0; padding: 20px; border: 1px solid #ddd; }
        code { background: #f5f5f5; padding: 2px 5px; }
        pre { background: #f5f5f5; padding: 10px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Claude Desktop Bridge - Web Interface</h1>
        <p>Plugin Status: <strong>${this.running ? 'Running' : 'Stopped'}</strong></p>
        
        <div class="api-section">
            <h2>HTTP API</h2>
            <p><strong>POST /message</strong> - Send message to Claude</p>
            <pre>curl -X POST http://localhost:${this.webConfig.httpPort}/message \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello Claude!"}'</pre>
            
            <p><strong>GET /status</strong> - Get plugin status</p>
            <pre>curl http://localhost:${this.webConfig.httpPort}/status</pre>
        </div>
        
        <div class="api-section">
            <h2>WebSocket API</h2>
            <p>Connect to: <code>ws://localhost:${this.webConfig.wsPort}</code></p>
            <p>Send message:</p>
            <pre>{"type": "message", "content": "Hello Claude!", "requestId": "123"}</pre>
        </div>
        
        <div class="api-section">
            <h2>Statistics</h2>
            <p>Active WebSocket connections: <strong>${this.wsConnections.size}</strong></p>
            <p>Messages processed: <strong>${this.statistics.messagesProcessed}</strong></p>
            <p>Responses sent: <strong>${this.statistics.responsesSent}</strong></p>
        </div>
    </div>
</body>
</html>`;
    }
    
    /**
     * Parse HTTP request body
     */
    async _parseRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            
            req.on('data', (chunk) => {
                body += chunk.toString();
            });
            
            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            });
            
            req.on('error', reject);
        });
    }
    
    /**
     * Get plugin-specific status
     */
    getStatus() {
        const baseStatus = super.getStatus();
        
        return {
            ...baseStatus,
            httpServerRunning: !!this.httpServer,
            wsServerRunning: !!this.wsServer,
            httpPort: this.webConfig.httpPort,
            wsPort: this.webConfig.wsPort,
            wsConnections: this.wsConnections.size,
            activeRequests: this.activeRequests.size,
            endpoints: {
                http: `http://localhost:${this.webConfig.httpPort}`,
                websocket: `ws://localhost:${this.webConfig.wsPort}`,
                status: `http://localhost:${this.webConfig.httpPort}/status`,
                message: `http://localhost:${this.webConfig.httpPort}/message`
            }
        };
    }
}

module.exports = WebPlugin;
