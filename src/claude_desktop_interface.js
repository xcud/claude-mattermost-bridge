/**
 * Claude Desktop Interface - Main Unified Interface
 * 
 * Consolidates DOM injection, WebSocket extraction, and desktop observability
 * into a single comprehensive interface with state management and API layer.
 * 
 * @author AI Collaboration
 * @version 1.0.0
 * @date August 3, 2025
 */

const EventEmitter = require('events');
const DesktopState = require('./desktop-state');
const ConnectionManager = require('./connection-manager');
const StateMonitorManager = require('./state-monitor-manager');
const ControlMethods = require('./control-methods');
const ExtractionMethods = require('./extraction-methods');
const ObservationMethods = require('./observation-methods');

/**
 * Main Claude Desktop Interface Class
 * Unified interface for all Claude Desktop automation with comprehensive state management
 */
class ClaudeDesktopInterface extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // Core components
        this.config = {
            chromeDebugPort: 9223,
            httpPort: 3001,
            wsPort: 3002,
            stateUpdateInterval: 1000,
            enableRealTimeUpdates: true,
            enableStateMonitoring: true,
            ...config
        };
        
        this.state = new DesktopState();
        this.connections = new ConnectionManager();
        this.monitors = new StateMonitorManager(this.state, this.connections);
        this.extractionMethods = new ExtractionMethods(this.state, this.connections);
        this.controlMethods = new ControlMethods(this.state, this.connections, this.extractionMethods.webSocketExtractor);
        this.observationMethods = new ObservationMethods(this.state, this.connections);
        
        // Operational flags
        this.initialized = false;
        this.running = false;
        
        // Bind event handlers
        this._setupEventHandlers();
    }
    
    /**
     * Initialize the interface
     */
    async initialize() {
        try {
            console.log('Initializing Claude Desktop Interface...');
            
            // Initialize Chrome Debug connection
            const chromeConnected = await this.connections.initializeChromeDebug();
            if (!chromeConnected) {
                throw new Error('Failed to connect to Chrome Debug Protocol');
            }
            
            this.state.updateState('connection', { chromeDebug: true });
            
            // Start state monitoring if enabled
            if (this.config.enableStateMonitoring) {
                this.monitors.startAllMonitors();
            }
            
            // Initialize HTTP/WebSocket servers if enabled
            if (this.config.enableRealTimeUpdates) {
                await this.connections.initializeHttpServer();
                await this.connections.initializeWebSocketServer();
            }
            
            this.initialized = true;
            this.running = true;
            
            console.log('Claude Desktop Interface initialized successfully');
            this.emit('initialized', this.state.getSnapshot());
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Claude Desktop Interface:', error);
            this.emit('error', { type: 'initialization', error });
            return false;
        }
    }    // =============================================================================
    // CONTROL METHODS (DOM Injection, Navigation)
    // =============================================================================
    
    /**
     * Inject message into Claude Desktop input field
     * Enhanced with state awareness and error handling
     */
    async injectMessage(message, options = {}) {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.controlMethods.injectMessage(message, options);
    }
    
    /**
     * Create new chat context
     */
    async createNewChat(contextData = null) {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.controlMethods.createNewChat(contextData);
    }
    
    /**
     * Navigate to specific chat
     */
    async navigateToChat(chatId) {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.controlMethods.navigateToChat(chatId);
    }
    
    /**
     * Clear input field
     */
    async clearInputField() {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.controlMethods.clearInputField();
    }
    
    /**
     * Wait for ready state
     */
    async waitForReadyState(timeout = 30000) {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.controlMethods.waitForReadyState(timeout);
    }    // =============================================================================
    // OBSERVATION METHODS (State Monitoring)
    // =============================================================================
    
    /**
     * Get submit button state
     */
    async getSubmitButtonState() {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.observationMethods.getSubmitButtonState();
    }
    
    /**
     * Get input field state
     */
    async getInputFieldState() {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.observationMethods.getInputFieldState();
    }
    
    /**
     * Get processing state
     */
    async getProcessingState() {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.observationMethods.getProcessingState();
    }
    
    /**
     * Get chat navigation state
     */
    async getChatNavigationState() {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.observationMethods.getChatNavigationState();
    }
    
    /**
     * Detect error states
     */
    async detectErrorStates() {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.observationMethods.detectErrorStates();
    }
    
    /**
     * Get complete desktop state
     */
    async getDesktopState() {
        return this.state.getSnapshot();
    }    // =============================================================================
    // EXTRACTION METHODS (Content Extraction)
    // =============================================================================
    
    /**
     * Extract content from Claude Desktop
     * Enhanced with real-time streaming capabilities
     */
    async extractContent(options = {}) {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.extractionMethods.extractContent(options);
    }
    
    /**
     * Monitor for response with anchor hash
     */
    async monitorForResponse(anchorHash, timeout = 60000, streamCallback = null) {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.extractionMethods.monitorForResponse(anchorHash, timeout, streamCallback);
    }
    
    /**
     * Stream content updates in real-time
     */
    async streamContentUpdates(anchorHash) {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.extractionMethods.streamContentUpdates(anchorHash);
    }
    
    /**
     * Detect response completion with multiple markers
     */
    async detectResponseCompletion(anchorHash) {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.extractionMethods.detectResponseCompletion(anchorHash);
    }    // =============================================================================
    // WORKFLOW METHODS (Integrated Operations)
    // =============================================================================
    
    /**
     * Perform complete context switch workflow
     */
    async performContextSwitch(contextData) {
        console.log('Performing context switch...');
        
        try {
            // 1. Create new chat
            const newChat = await this.createNewChat();
            if (!newChat.success) {
                throw new Error('Failed to create new chat');
            }
            
            await this.waitForState('chatNavigation', 'ready');
            
            // 2. Inject context
            const contextInjection = await this.injectMessage(`Context: ${contextData}`);
            if (!contextInjection.success) {
                throw new Error('Failed to inject context');
            }
            
            await this.waitForState('processing', 'complete');
            
            // 3. Verify context loaded
            const verification = await this.verifyContextLoaded();
            
            return { 
                success: true,
                chatId: newChat.chatId, 
                contextLoaded: verification,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('Context switch failed:', error);
            return {
                success: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Wait for specific state condition
     */
    async waitForState(category, condition, timeout = 30000) {
        if (!this.initialized) {
            throw new Error('Interface not initialized');
        }
        
        return await this.observationMethods.waitForState(category, condition, timeout);
    }
    
    /**
     * Verify context has been loaded
     */
    async verifyContextLoaded() {
        // Implementation pending - context verification
        return false;
    }    // =============================================================================
    // UTILITY AND LIFECYCLE METHODS
    // =============================================================================
    
    /**
     * Setup event handlers
     */
    _setupEventHandlers() {
        // Handle state changes and emit events
        this.on('stateChange', (data) => {
            console.log(`State change: ${data.category} ->`, data.updates);
        });
        
        this.on('error', (error) => {
            console.error('Interface error:', error);
            this.state.updateState('errors', {
                active: true,
                type: error.type || 'unknown',
                message: error.message || error.toString(),
                timestamp: Date.now()
            });
        });
    }
    
    /**
     * Shutdown the interface gracefully
     */
    async shutdown() {
        console.log('Shutting down Claude Desktop Interface...');
        
        this.running = false;
        
        // Stop all monitors
        this.monitors.stopAllMonitors();
        
        // Clean up extraction methods
        this.extractionMethods.cleanup();
        
        // Clean up all connections
        await this.connections.cleanup();
        
        this.initialized = false;
        
        console.log('Claude Desktop Interface shut down complete');
        this.emit('shutdown');
    }
    
    /**
     * Get interface status and health
     */
    getStatus() {
        return {
            initialized: this.initialized,
            running: this.running,
            connections: this.state.connection,
            uptime: this.initialized ? Date.now() - this.state.lastStateUpdate : 0,
            version: '1.0.0'
        };
    }
}

// Export the main class and supporting classes
module.exports = {
    ClaudeDesktopInterface,
    DesktopState,
    ConnectionManager,
    StateMonitorManager
};