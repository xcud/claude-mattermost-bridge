/**
 * Mattermost Plugin - Mattermost Interface Implementation
 * 
 * Implements Mattermost webhook interface using the new plugin architecture.
 * Wraps existing Mattermost functionality with the new anchor system.
 * 
 * @author AI Collaboration
 * @version 2.0.0
 * @date August 9, 2025
 */

const BasePlugin = require('../base-plugin');
const http = require('http');
const https = require('https');

class MattermostPlugin extends BasePlugin {
    constructor(config = {}) {
        super(config);
        
        // Plugin metadata
        this.name = 'mattermost';
        this.version = '2.0.0';
        this.description = 'Mattermost webhook interface for Claude Desktop bridge';
        
        // Mattermost-specific configuration
        this.mattermostConfig = {
            webhookUrl: '',
            channel: '#claude-ben',
            username: 'claude-bridge',
            iconUrl: 'https://claude.ai/favicon.ico',
            timeout: 10000,
            retryAttempts: 3,
            ...config.mattermost
        };
        
        // HTTP server for receiving webhooks
        this.server = null;
        this.serverPort = config.port || 3000;
        
        // Active conversations tracking
        this.activeConversations = new Map();
        
        this.log('MattermostPlugin initialized');
    }
    
    /**
     * Initialize the Mattermost plugin
     */
    async _doInitialize() {
        // Validate required configuration
        if (!this.mattermostConfig.webhookUrl) {
            throw new Error('Mattermost webhook URL is required');
        }
        
        // Validate webhook URL format
        try {
            new URL(this.mattermostConfig.webhookUrl);
        } catch (error) {
            throw new Error(`Invalid webhook URL: ${this.mattermostConfig.webhookUrl}`);
        }
        
        this.log('Mattermost plugin validation complete');
    }
    
    /**
     * Start the Mattermost plugin
     */
    async _doStart() {
        // Create HTTP server to receive Mattermost webhooks
        this.server = http.createServer((req, res) => {
            this._handleHttpRequest(req, res);
        });
        
        // Start server
        await new Promise((resolve, reject) => {
            this.server.listen(this.serverPort, (error) => {
                if (error) {
                    reject(error);
                } else {
                    this.log(`HTTP server listening on port ${this.serverPort}`);
                    resolve();
                }
            });
        });
        
        this.log(`Mattermost plugin ready - webhook endpoint: http://localhost:${this.serverPort}/webhook`);
    }
    
    /**
     * Stop the Mattermost plugin
     */
    async _doStop() {
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(() => {
                    this.log('HTTP server stopped');
                    resolve();
                });
            });
            this.server = null;
        }
        
        // Clear active conversations
        this.activeConversations.clear();
    }
    
    /**
     * Handle incoming Mattermost message
     */
    async _doHandleMessage(message, context) {
        const { text, user_name, channel_name } = message;
        
        if (!text || text.trim() === '') {
            throw new Error('Empty message received');
        }
        
        // Create conversation context
        const conversationContext = {
            source: 'mattermost',
            channel: channel_name || this.mattermostConfig.channel,
            user: user_name || 'unknown',
            timestamp: Date.now()
        };
        
        this.log(`Processing message from ${user_name}: "${text.substring(0, 50)}..."`);
        
        try {
            // Process through bridge core with streaming
            const result = await this.processMessage(text, {
                format: 'mattermost',
                source: this.name,
                contextData: conversationContext,
                streamCallback: (update) => {
                    // Send streaming updates back to Mattermost if needed
                    if (update.complete) {
                        this._sendToMattermost(update.content, conversationContext);
                    }
                }
            });
            
            return {
                success: true,
                response: result.content,
                context: conversationContext
            };
            
        } catch (error) {
            this.log(`Message processing failed: ${error.message}`);
            
            // Send error message to Mattermost
            await this._sendToMattermost(
                `❌ Error processing message: ${error.message}`,
                conversationContext
            );
            
            throw error;
        }
    }
    
    /**
     * Send response back to Mattermost
     */
    async _doSendResponse(response, context) {
        return await this._sendToMattermost(response, context);
    }
    
    /**
     * Handle HTTP requests to the webhook endpoint
     */
    async _handleHttpRequest(req, res) {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }
        
        if (!req.url || !req.url.includes('/webhook')) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Endpoint not found' }));
            return;
        }
        
        try {
            // Parse request body
            const body = await this._parseRequestBody(req);
            
            // Handle the Mattermost webhook
            const result = await this.handleMessage(body);
            
            // Send success response
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Message processed successfully'
            }));
            
        } catch (error) {
            this.log(`HTTP request handling failed: ${error.message}`);
            
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }
    
    /**
     * Send message to Mattermost via webhook
     */
    async _sendToMattermost(text, context = {}) {
        const payload = {
            text: text,
            channel: context.channel || this.mattermostConfig.channel,
            username: this.mattermostConfig.username,
            icon_url: this.mattermostConfig.iconUrl
        };
        
        const url = new URL(this.mattermostConfig.webhookUrl);
        const isHttps = url.protocol === 'https:';
        const httpModule = isHttps ? https : http;
        
        const postData = JSON.stringify(payload);
        
        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: this.mattermostConfig.timeout
        };
        
        return new Promise((resolve, reject) => {
            const req = httpModule.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        this.log(`Message sent to Mattermost successfully`);
                        resolve({
                            success: true,
                            statusCode: res.statusCode,
                            response: responseData
                        });
                    } else {
                        reject(new Error(`Mattermost webhook failed: ${res.statusCode} ${responseData}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`Mattermost request failed: ${error.message}`));
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Mattermost request timeout'));
            });
            
            req.write(postData);
            req.end();
        });
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
                    // Try to parse as JSON
                    if (req.headers['content-type']?.includes('application/json')) {
                        resolve(JSON.parse(body));
                    } else {
                        // Parse as URL-encoded form data
                        const params = new URLSearchParams(body);
                        const data = {};
                        for (const [key, value] of params) {
                            data[key] = value;
                        }
                        resolve(data);
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse request body: ${error.message}`));
                }
            });
            
            req.on('error', (error) => {
                reject(error);
            });
        });
    }
    
    /**
     * Get plugin-specific status
     */
    getStatus() {
        const baseStatus = super.getStatus();
        
        return {
            ...baseStatus,
            serverRunning: !!this.server,
            serverPort: this.serverPort,
            webhookUrl: this.mattermostConfig.webhookUrl ? '***configured***' : 'not set',
            activeConversations: this.activeConversations.size,
            mattermostConfig: {
                channel: this.mattermostConfig.channel,
                username: this.mattermostConfig.username,
                timeout: this.mattermostConfig.timeout,
                retryAttempts: this.mattermostConfig.retryAttempts
            }
        };
    }
}

module.exports = MattermostPlugin;
