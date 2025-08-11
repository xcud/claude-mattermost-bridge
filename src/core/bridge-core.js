/**
 * Bridge Core - Main Plugin Host and Coordinator
 * 
 * Provides unified API for all Claude Desktop bridge operations.
 * Hosts plugins and coordinates shared services.
 * 
 * @author AI Collaboration  
 * @version 2.0.0
 * @date August 9, 2025
 */

const EventEmitter = require('events');
const MessageService = require('./message-service');
const AnchorService = require('./anchor-service');
const AuthService = require('./auth-service');
const FormatService = require('./format-service');
const ContextService = require('./context-service');

/**
 * Bridge Core - Central coordinator for all bridge operations
 */
class BridgeCore extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            chromeDebugPort: 9223,
            enableLogging: true,
            enableMetrics: true,
            defaultTimeout: 30000,
            maxConcurrentMessages: 10,
            ...config
        };
        
        // Initialize core services
        this.messageService = new MessageService(this.config);
        this.anchorService = new AnchorService(this.config);
        this.authService = new AuthService(this.config);
        this.formatService = new FormatService(this.config);
        this.contextService = new ContextService(this.config);
        
        // Plugin management
        this.plugins = new Map();
        this.activeContexts = new Map();
        
        // Operational state
        this.initialized = false;
        this.running = false;
        
        // Bind event handlers
        this._bindEvents();
        
        this.log('BridgeCore initialized');
    }
    
    /**
     * Initialize the bridge core and all services
     */
    async initialize() {
        if (this.initialized) {
            this.log('BridgeCore already initialized');
            return true;
        }
        
        try {
            this.log('Initializing BridgeCore services...');
            
            // Initialize all services
            await this.authService.initialize();
            await this.messageService.initialize();
            await this.anchorService.initialize();
            await this.formatService.initialize();
            await this.contextService.initialize();
            
            this.initialized = true;
            this.emit('initialized');
            
            this.log('BridgeCore initialization complete');
            return true;
            
        } catch (error) {
            this.log(`BridgeCore initialization failed: ${error.message}`);
            this.emit('error', error);
            return false;
        }
    }
    
    /**
     * Start the bridge core (ready to accept plugin requests)
     */
    async start() {
        if (!this.initialized) {
            throw new Error('BridgeCore must be initialized before starting');
        }
        
        if (this.running) {
            this.log('BridgeCore already running');
            return;
        }
        
        try {
            this.log('Starting BridgeCore...');
            
            // Start all services
            await this.authService.start();
            await this.messageService.start();
            
            this.running = true;
            this.emit('started');
            
            this.log('BridgeCore started successfully');
            
        } catch (error) {
            this.log(`BridgeCore start failed: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * Stop the bridge core and all services
     */
    async stop() {
        if (!this.running) {
            this.log('BridgeCore not running');
            return;
        }
        
        try {
            this.log('Stopping BridgeCore...');
            
            // Stop all plugins first
            for (const [name, plugin] of this.plugins) {
                try {
                    await plugin.stop();
                    this.log(`Plugin ${name} stopped`);
                } catch (error) {
                    this.log(`Error stopping plugin ${name}: ${error.message}`);
                }
            }
            
            // Stop all services
            await this.messageService.stop();
            await this.authService.stop();
            
            this.running = false;
            this.emit('stopped');
            
            this.log('BridgeCore stopped successfully');
            
        } catch (error) {
            this.log(`BridgeCore stop failed: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * PLUGIN API: Inject message to Claude Desktop
     */
    async injectMessage(content, options = {}) {
        this._validateRunning();
        
        const {
            format = 'plain',
            timeout = this.config.defaultTimeout,
            priority = 'normal',
            contextId = null
        } = options;
        
        try {
            // Generate unique anchor
            const anchor = this.anchorService.generateAnchor();
            
            // Create or update context
            const context = contextId ? 
                this.contextService.getContext(contextId) :
                this.contextService.createContext({
                    anchor,
                    source: options.source || 'unknown',
                    timestamp: Date.now()
                });
            
            // Format message
            const formattedContent = this.formatService.formatMessage(content, format, {
                anchor,
                context
            });
            
            // Track anchor
            this.anchorService.trackAnchor(anchor, {
                contextId: context.id,
                injectedAt: Date.now(),
                timeout
            });
            
            // Inject via message service
            const result = await this.messageService.injectMessage(formattedContent, anchor, {
                timeout,
                priority
            });
            
            // Update context
            this.contextService.updateContext(context.id, {
                anchor,
                injectionResult: result,
                status: 'injected'
            });
            
            this.emit('message-injected', {
                anchor,
                contextId: context.id,
                content: formattedContent,
                result
            });
            
            return {
                success: true,
                anchor,
                contextId: context.id,
                result
            };
            
        } catch (error) {
            this.log(`Message injection failed: ${error.message}`);
            this.emit('injection-error', { content, error });
            throw error;
        }
    }
    
    /**
     * PLUGIN API: Extract response from Claude Desktop
     */
    async extractResponse(anchor, options = {}) {
        this._validateRunning();
        
        const {
            timeout = this.config.defaultTimeout,
            format = 'plain'
        } = options;
        
        try {
            // Extract via message service
            const result = await this.messageService.extractResponse(anchor, {
                timeout
            });
            
            if (!result.success) {
                throw new Error(`Extraction failed: ${result.message || 'Unknown error'}`);
            }
            
            // Format response
            const formattedContent = this.formatService.formatResponse(result.content, format);
            
            // Update anchor tracking
            this.anchorService.updateAnchor(anchor, {
                extractedAt: Date.now(),
                responseLength: result.content.length,
                status: 'extracted'
            });
            
            this.emit('response-extracted', {
                anchor,
                content: formattedContent,
                rawContent: result.content
            });
            
            return {
                success: true,
                content: formattedContent,
                rawContent: result.content,
                metadata: result.metadata
            };
            
        } catch (error) {
            this.log(`Response extraction failed: ${error.message}`);
            this.emit('extraction-error', { anchor, error });
            throw error;
        }
    }
    
    /**
     * PLUGIN API: Stream response updates from Claude Desktop
     */
    async streamResponse(anchor, callback, options = {}) {
        this._validateRunning();
        
        if (typeof callback !== 'function') {
            throw new Error('Callback function required for streaming');
        }
        
        const {
            timeout = this.config.defaultTimeout,
            interval = 1000,
            format = 'plain'
        } = options;
        
        try {
            // Start streaming via message service
            const stream = await this.messageService.streamResponse(anchor, (update) => {
                try {
                    // Format streamed content
                    const formattedContent = this.formatService.formatResponse(
                        update.content, 
                        format
                    );
                    
                    // Call plugin callback with formatted content
                    callback({
                        ...update,
                        content: formattedContent,
                        rawContent: update.content
                    });
                    
                    this.emit('response-streamed', {
                        anchor,
                        content: formattedContent,
                        complete: update.complete
                    });
                    
                } catch (error) {
                    this.log(`Stream callback error: ${error.message}`);
                    this.emit('stream-error', { anchor, error });
                }
            }, {
                timeout,
                interval
            });
            
            return stream;
            
        } catch (error) {
            this.log(`Response streaming failed: ${error.message}`);
            this.emit('stream-error', { anchor, error });
            throw error;
        }
    }
    
    /**
     * PLUGIN API: Generate unique anchor
     */
    generateAnchor() {
        return this.anchorService.generateAnchor();
    }
    
    /**
     * PLUGIN API: Create message context
     */
    createContext(metadata = {}) {
        return this.contextService.createContext(metadata);
    }
    
    /**
     * PLUGIN API: Get context by ID
     */
    getContext(contextId) {
        return this.contextService.getContext(contextId);
    }
    
    /**
     * PLUGIN API: Update context
     */
    updateContext(contextId, updates) {
        return this.contextService.updateContext(contextId, updates);
    }
    
    /**
     * PLUGIN API: Validate session/connection
     */
    async validateSession() {
        return await this.authService.validateSession();
    }
    
    /**
     * PLUGIN API: Get system status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            running: this.running,
            plugins: Array.from(this.plugins.keys()),
            activeContexts: this.activeContexts.size,
            services: {
                auth: this.authService.getStatus(),
                message: this.messageService.getStatus(),
                anchor: this.anchorService.getStatus(),
                context: this.contextService.getStatus()
            }
        };
    }
    
    /**
     * Register a plugin with the core
     */
    registerPlugin(plugin) {
        if (!plugin.name) {
            throw new Error('Plugin must have a name');
        }
        
        if (this.plugins.has(plugin.name)) {
            throw new Error(`Plugin ${plugin.name} already registered`);
        }
        
        this.plugins.set(plugin.name, plugin);
        plugin.core = this; // Give plugin access to core
        
        this.log(`Plugin registered: ${plugin.name}`);
        this.emit('plugin-registered', plugin);
    }
    
    /**
     * Unregister a plugin
     */
    unregisterPlugin(name) {
        if (!this.plugins.has(name)) {
            throw new Error(`Plugin ${name} not found`);
        }
        
        const plugin = this.plugins.get(name);
        this.plugins.delete(name);
        
        this.log(`Plugin unregistered: ${name}`);
        this.emit('plugin-unregistered', plugin);
    }
    
    /**
     * Private helper methods
     */
    _validateRunning() {
        if (!this.running) {
            throw new Error('BridgeCore is not running');
        }
    }
    
    _bindEvents() {
        // Forward service events
        this.messageService.on('error', (error) => this.emit('message-service-error', error));
        this.authService.on('error', (error) => this.emit('auth-service-error', error));
        this.anchorService.on('error', (error) => this.emit('anchor-service-error', error));
    }
    
    log(message) {
        if (this.config.enableLogging) {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [BridgeCore] ${message}`);
        }
    }
}

module.exports = BridgeCore;
