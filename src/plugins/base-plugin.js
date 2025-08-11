/**
 * Base Plugin - Abstract Plugin Class
 * 
 * Defines the plugin interface that all interface plugins must implement.
 * Provides common functionality and standardized lifecycle management.
 * 
 * @author AI Collaboration
 * @version 2.0.0
 * @date August 9, 2025
 */

const EventEmitter = require('events');

/**
 * Abstract base class for all bridge plugins
 */
class BasePlugin extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // Plugin metadata (must be overridden by subclasses)
        this.name = 'base-plugin';
        this.version = '1.0.0';
        this.description = 'Base plugin class';
        
        // Plugin configuration
        this.config = {
            enabled: true,
            enableLogging: true,
            ...config
        };
        
        // Plugin state
        this.initialized = false;
        this.running = false;
        this.core = null; // Will be set when registered with BridgeCore
        
        // Statistics
        this.statistics = {
            messagesReceived: 0,
            messagesProcessed: 0,
            responsesSent: 0,
            errors: 0,
            startTime: null,
            lastActivity: null
        };
        
        this.log('BasePlugin initialized');
    }
    
    /**
     * Initialize the plugin (override in subclasses)
     */
    async initialize() {
        if (this.initialized) {
            this.log('Plugin already initialized');
            return true;
        }
        
        try {
            this.log('Initializing plugin...');
            
            // Validate core is available
            if (!this.core) {
                throw new Error('Plugin must be registered with BridgeCore before initialization');
            }
            
            // Call subclass initialization
            await this._doInitialize();
            
            this.initialized = true;
            this.emit('initialized');
            
            this.log('Plugin initialization complete');
            return true;
            
        } catch (error) {
            this.log(`Plugin initialization failed: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * Start the plugin (override in subclasses)
     */
    async start() {
        if (!this.initialized) {
            throw new Error('Plugin must be initialized before starting');
        }
        
        if (this.running) {
            this.log('Plugin already running');
            return;
        }
        
        try {
            this.log('Starting plugin...');
            
            // Call subclass start logic
            await this._doStart();
            
            this.running = true;
            this.statistics.startTime = Date.now();
            this.emit('started');
            
            this.log('Plugin started successfully');
            
        } catch (error) {
            this.log(`Plugin start failed: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * Stop the plugin (override in subclasses)
     */
    async stop() {
        if (!this.running) {
            this.log('Plugin not running');
            return;
        }
        
        try {
            this.log('Stopping plugin...');
            
            // Call subclass stop logic
            await this._doStop();
            
            this.running = false;
            this.emit('stopped');
            
            this.log('Plugin stopped successfully');
            
        } catch (error) {
            this.log(`Plugin stop failed: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * Handle incoming message (must be implemented by subclasses)
     */
    async handleMessage(message, context = {}) {
        this.statistics.messagesReceived++;
        this.statistics.lastActivity = Date.now();
        
        try {
            // Validate message
            if (!message || typeof message !== 'object') {
                throw new Error('Invalid message format');
            }
            
            // Call subclass message handler
            const result = await this._doHandleMessage(message, context);
            
            this.statistics.messagesProcessed++;
            this.emit('message-handled', { message, context, result });
            
            return result;
            
        } catch (error) {
            this.statistics.errors++;
            this.log(`Message handling failed: ${error.message}`);
            this.emit('message-error', { message, context, error });
            throw error;
        }
    }
    
    /**
     * Send response back to external system (must be implemented by subclasses)
     */
    async sendResponse(response, context = {}) {
        try {
            // Call subclass response sender
            const result = await this._doSendResponse(response, context);
            
            this.statistics.responsesSent++;
            this.emit('response-sent', { response, context, result });
            
            return result;
            
        } catch (error) {
            this.statistics.errors++;
            this.log(`Response sending failed: ${error.message}`);
            this.emit('response-error', { response, context, error });
            throw error;
        }
    }
    
    /**
     * Get plugin status and statistics
     */
    getStatus() {
        return {
            name: this.name,
            version: this.version,
            description: this.description,
            initialized: this.initialized,
            running: this.running,
            config: { ...this.config },
            statistics: { ...this.statistics },
            uptime: this.statistics.startTime ? Date.now() - this.statistics.startTime : 0
        };
    }
    
    /**
     * Reset plugin statistics
     */
    resetStatistics() {
        const startTime = this.statistics.startTime;
        this.statistics = {
            messagesReceived: 0,
            messagesProcessed: 0,
            responsesSent: 0,
            errors: 0,
            startTime: startTime,
            lastActivity: null
        };
        
        this.log('Statistics reset');
        this.emit('statistics-reset');
    }
    
    /**
     * Helper method to process message through bridge core
     */
    async processMessage(content, options = {}) {
        if (!this.core) {
            throw new Error('Plugin not registered with BridgeCore');
        }
        
        try {
            // Inject message
            const injectionResult = await this.core.injectMessage(content, {
                source: this.name,
                format: options.format || 'plain',
                ...options
            });
            
            if (!injectionResult.success) {
                throw new Error('Message injection failed');
            }
            
            // Stream response if callback provided
            if (options.streamCallback) {
                return await this.core.streamResponse(
                    injectionResult.anchor,
                    options.streamCallback,
                    options
                );
            } else {
                // Extract response
                return await this.core.extractResponse(
                    injectionResult.anchor,
                    options
                );
            }
            
        } catch (error) {
            this.log(`Message processing failed: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Abstract methods that must be implemented by subclasses
     */
    async _doInitialize() {
        // Override in subclasses
        throw new Error('_doInitialize must be implemented by subclass');
    }
    
    async _doStart() {
        // Override in subclasses
        throw new Error('_doStart must be implemented by subclass');
    }
    
    async _doStop() {
        // Override in subclasses
        throw new Error('_doStop must be implemented by subclass');
    }
    
    async _doHandleMessage(message, context) {
        // Override in subclasses
        throw new Error('_doHandleMessage must be implemented by subclass');
    }
    
    async _doSendResponse(response, context) {
        // Override in subclasses
        throw new Error('_doSendResponse must be implemented by subclass');
    }
    
    /**
     * Logging helper
     */
    log(message) {
        if (this.config.enableLogging) {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [${this.name}] ${message}`);
        }
    }
}

module.exports = BasePlugin;
