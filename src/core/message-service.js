/**
 * Message Service - Message Injection and Extraction
 * 
 * Handles all Claude Desktop message operations using the new unique anchor system.
 * Wraps existing DOMInjector and WebSocketExtractor with a clean API.
 * 
 * @author AI Collaboration
 * @version 2.0.0 
 * @date August 9, 2025
 */

const EventEmitter = require('events');
const DOMInjector = require('../dom-injector');
const WebSocketExtractor = require('../websocket-extractor');

class MessageService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            chromeDebugPort: 9223,
            defaultTimeout: 30000,
            maxRetries: 3,
            enableLogging: true,
            ...config
        };
        
        // Initialize existing components with new anchor system
        this.domInjector = new DOMInjector(this.config.chromeDebugPort);
        this.webSocketExtractor = new WebSocketExtractor(this.config.chromeDebugPort);
        
        // Service state
        this.initialized = false;
        this.activeExtractions = new Map(); // anchor -> extraction info
        this.statistics = {
            injectionsCount: 0,
            extractionsCount: 0,
            successfulInjections: 0,
            successfulExtractions: 0,
            averageResponseTime: 0
        };
        
        this.log('MessageService initialized');
    }
    
    /**
     * Initialize the message service
     */
    async initialize() {
        if (this.initialized) {
            this.log('MessageService already initialized');
            return true;
        }
        
        try {
            this.log('Initializing MessageService...');
            
            // Test connection to Claude Desktop
            const connectionTest = await this._testConnection();
            if (!connectionTest.success) {
                throw new Error(`Claude Desktop connection failed: ${connectionTest.error}`);
            }
            
            this.initialized = true;
            this.emit('initialized');
            
            this.log('MessageService initialization complete');
            return true;
            
        } catch (error) {
            this.log(`MessageService initialization failed: ${error.message}`);
            this.emit('error', error);
            return false;
        }
    }
    
    /**
     * Start the message service
     */
    async start() {
        if (!this.initialized) {
            throw new Error('MessageService must be initialized before starting');
        }
        
        this.log('MessageService started');
        this.emit('started');
    }
    
    /**
     * Stop the message service  
     */
    async stop() {
        this.log('Stopping MessageService...');
        
        // Clean up any active extractions
        this.webSocketExtractor.cleanup();
        this.activeExtractions.clear();
        
        this.emit('stopped');
        this.log('MessageService stopped');
    }
    
    /**
     * Inject message to Claude Desktop with unique anchor
     */
    async injectMessage(content, anchor, options = {}) {
        this._validateInitialized();
        
        const {
            timeout = this.config.defaultTimeout,
            retries = this.config.maxRetries,
            priority = 'normal'
        } = options;
        
        const startTime = Date.now();
        this.statistics.injectionsCount++;
        
        try {
            this.log(`Injecting message with anchor: ${anchor}`);
            
            // Use DOMInjector with the provided anchor
            const result = await this.domInjector.injectMessage(content, anchor);
            
            if (!result.success) {
                throw new Error('DOM injection failed');
            }
            
            // Track injection for extraction
            this.webSocketExtractor.trackInjection(anchor);
            
            this.statistics.successfulInjections++;
            this._updateAverageResponseTime(Date.now() - startTime);
            
            this.emit('message-injected', {
                anchor,
                content,
                result,
                timestamp: Date.now()
            });
            
            this.log(`Message injected successfully: ${anchor}`);
            
            return {
                success: true,
                anchor,
                method: result.method,
                timestamp: result.timestamp
            };
            
        } catch (error) {
            this.log(`Message injection failed: ${error.message}`);
            this.emit('injection-error', { anchor, content, error });
            throw error;
        }
    }
    
    /**
     * Extract response from Claude Desktop using anchor
     */
    async extractResponse(anchor, options = {}) {
        this._validateInitialized();
        
        const {
            timeout = this.config.defaultTimeout,
            retries = this.config.maxRetries
        } = options;
        
        const startTime = Date.now();
        this.statistics.extractionsCount++;
        
        try {
            this.log(`Extracting response for anchor: ${anchor}`);
            
            // Use WebSocketExtractor with new anchor approach
            const result = await this.webSocketExtractor.extractContent(anchor, {
                timeout,
                retries
            });
            
            if (!result.success) {
                throw new Error(`Extraction failed: ${result.message || 'Unknown error'}`);
            }
            
            this.statistics.successfulExtractions++;
            this._updateAverageResponseTime(Date.now() - startTime);
            
            this.emit('response-extracted', {
                anchor,
                content: result.content,
                metadata: result.metadata,
                timestamp: Date.now()
            });
            
            this.log(`Response extracted successfully: ${result.content.length} chars`);
            
            return {
                success: true,
                content: result.content,
                complete: result.complete,
                metadata: result.metadata,
                timestamp: result.timestamp
            };
            
        } catch (error) {
            this.log(`Response extraction failed: ${error.message}`);
            this.emit('extraction-error', { anchor, error });
            throw error;
        }
    }
    
    /**
     * Stream response updates from Claude Desktop
     */
    async streamResponse(anchor, callback, options = {}) {
        this._validateInitialized();
        
        if (typeof callback !== 'function') {
            throw new Error('Callback function required for streaming');
        }
        
        const {
            timeout = this.config.defaultTimeout,
            interval = 1000
        } = options;
        
        try {
            this.log(`Starting response streaming for anchor: ${anchor}`);
            
            // Track this streaming operation
            this.activeExtractions.set(anchor, {
                startTime: Date.now(),
                callback,
                options
            });
            
            // Use WebSocketExtractor monitoring with callback
            const result = await this.webSocketExtractor.monitorForResponse(
                anchor,
                timeout,
                (streamUpdate) => {
                    try {
                        // Forward update to plugin callback
                        callback(streamUpdate);
                        
                        this.emit('response-streamed', {
                            anchor,
                            content: streamUpdate.content,
                            complete: streamUpdate.complete,
                            timestamp: streamUpdate.timestamp
                        });
                        
                    } catch (error) {
                        this.log(`Stream callback error: ${error.message}`);
                        this.emit('stream-callback-error', { anchor, error });
                    }
                }
            );
            
            // Clean up tracking
            this.activeExtractions.delete(anchor);
            
            this.log(`Response streaming completed for anchor: ${anchor}`);
            
            return result;
            
        } catch (error) {
            this.log(`Response streaming failed: ${error.message}`);
            this.activeExtractions.delete(anchor);
            this.emit('stream-error', { anchor, error });
            throw error;
        }
    }
    
    /**
     * Get service status and statistics
     */
    getStatus() {
        return {
            initialized: this.initialized,
            activeExtractions: this.activeExtractions.size,
            statistics: { ...this.statistics },
            config: {
                chromeDebugPort: this.config.chromeDebugPort,
                defaultTimeout: this.config.defaultTimeout,
                maxRetries: this.config.maxRetries
            }
        };
    }
    
    /**
     * Get detailed statistics
     */
    getStatistics() {
        const totalInjections = this.statistics.injectionsCount;
        const totalExtractions = this.statistics.extractionsCount;
        
        return {
            ...this.statistics,
            injectionSuccessRate: totalInjections > 0 ? 
                (this.statistics.successfulInjections / totalInjections * 100).toFixed(2) + '%' : 'N/A',
            extractionSuccessRate: totalExtractions > 0 ? 
                (this.statistics.successfulExtractions / totalExtractions * 100).toFixed(2) + '%' : 'N/A',
            averageResponseTimeFormatted: this.statistics.averageResponseTime.toFixed(0) + 'ms'
        };
    }
    
    /**
     * Reset statistics
     */
    resetStatistics() {
        this.statistics = {
            injectionsCount: 0,
            extractionsCount: 0,
            successfulInjections: 0,
            successfulExtractions: 0,
            averageResponseTime: 0
        };
        
        this.log('Statistics reset');
        this.emit('statistics-reset');
    }
    
    /**
     * Private helper methods
     */
    async _testConnection() {
        try {
            const pages = await this.domInjector.getPages();
            if (!pages) {
                return { success: false, error: 'Could not connect to Chrome Debug Protocol' };
            }
            
            const claudePage = this.domInjector.findClaudePage(pages);
            if (!claudePage) {
                return { success: false, error: 'Could not find Claude page' };
            }
            
            return { success: true, page: claudePage.title };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    _validateInitialized() {
        if (!this.initialized) {
            throw new Error('MessageService is not initialized');
        }
    }
    
    _updateAverageResponseTime(responseTime) {
        const currentAvg = this.statistics.averageResponseTime;
        const totalOps = this.statistics.successfulInjections + this.statistics.successfulExtractions;
        
        if (totalOps === 1) {
            this.statistics.averageResponseTime = responseTime;
        } else {
            this.statistics.averageResponseTime = ((currentAvg * (totalOps - 1)) + responseTime) / totalOps;
        }
    }
    
    log(message) {
        if (this.config.enableLogging) {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [MessageService] ${message}`);
        }
    }
}

module.exports = MessageService;
