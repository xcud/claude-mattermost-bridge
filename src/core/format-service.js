/**
 * Format Service - Message Formatting and Transformation
 * 
 * Handles message formatting for different interfaces and response processing.
 * 
 * @author AI Collaboration
 * @version 2.0.0
 * @date August 9, 2025
 */

const EventEmitter = require('events');

class FormatService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableLogging: true,
            defaultFormat: 'plain',
            maxMessageLength: 10000,
            ...config
        };
        
        this.initialized = false;
        this.formatters = new Map();
        
        // Register built-in formatters
        this._registerBuiltinFormatters();
        
        this.log('FormatService initialized');
    }
    
    async initialize() {
        if (this.initialized) return true;
        
        this.initialized = true;
        this.emit('initialized');
        this.log('FormatService initialization complete');
        return true;
    }
    
    formatMessage(content, format = 'plain', options = {}) {
        const { anchor, context } = options;
        
        switch (format) {
            case 'mattermost':
                return this._formatMattermostMessage(content, anchor, context);
            case 'web':
                return this._formatWebMessage(content, anchor, context);
            case 'plain':
            default:
                return this._formatPlainMessage(content, anchor, context);
        }
    }
    
    formatResponse(content, format = 'plain') {
        switch (format) {
            case 'mattermost':
                return this._formatMattermostResponse(content);
            case 'web':
                return this._formatWebResponse(content);
            case 'json':
                return this._formatJsonResponse(content);
            case 'plain':
            default:
                return this._formatPlainResponse(content);
        }
    }
    
    _formatMattermostMessage(content, anchor, context) {
        const timestamp = new Date().toLocaleString();
        const channel = context?.channel || '#claude';
        const user = context?.user || 'bridge';
        
        return `[BRIDGE: ${channel} | User: ${user} | ${timestamp} | ANCHOR: ${anchor}] ${content}`;
    }
    
    _formatWebMessage(content, anchor, context) {
        return `[BRIDGE: Web Interface | ANCHOR: ${anchor}] ${content}`;
    }
    
    _formatPlainMessage(content, anchor, context) {
        return `[BRIDGE: Message | ANCHOR: ${anchor}] ${content}`;
    }
    
    _formatMattermostResponse(content) {
        // Clean up common Claude UI elements that shouldn't appear in Mattermost
        return content
            .replace(/Message Claude.*$/gm, '')
            .replace(/Type a message.*$/gm, '')
            .replace(/Chat controls.*$/gm, '')
            .trim();
    }
    
    _formatWebResponse(content) {
        // Format for web interface (JSON structure)
        return {
            content: content,
            timestamp: Date.now(),
            format: 'text'
        };
    }
    
    _formatJsonResponse(content) {
        return JSON.stringify({
            response: content,
            timestamp: Date.now(),
            source: 'claude-desktop'
        });
    }
    
    _formatPlainResponse(content) {
        return content;
    }
    
    _registerBuiltinFormatters() {
        // Built-in formatters are implemented as methods above
        // This method reserved for future extensibility
    }
    
    getStatus() {
        return {
            initialized: this.initialized,
            availableFormats: ['plain', 'mattermost', 'web', 'json'],
            config: {
                defaultFormat: this.config.defaultFormat,
                maxMessageLength: this.config.maxMessageLength
            }
        };
    }
    
    log(message) {
        if (this.config.enableLogging) {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [FormatService] ${message}`);
        }
    }
}

module.exports = FormatService;
