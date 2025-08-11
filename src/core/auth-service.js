/**
 * Auth Service - Authentication and Session Management
 * 
 * Manages Claude Desktop connection validation and session state.
 * 
 * @author AI Collaboration
 * @version 2.0.0  
 * @date August 9, 2025
 */

const EventEmitter = require('events');

class AuthService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            chromeDebugPort: 9223,
            enableLogging: true,
            sessionCheckInterval: 30000, // 30 seconds
            connectionTimeout: 5000,
            ...config
        };
        
        this.initialized = false;
        this.sessionValid = false;
        this.lastCheck = null;
        this.sessionTimer = null;
        
        this.log('AuthService initialized');
    }
    
    async initialize() {
        if (this.initialized) return true;
        
        try {
            this.log('Initializing AuthService...');
            
            // Initial session validation
            const isValid = await this.validateSession();
            if (!isValid) {
                this.log('Warning: Initial session validation failed');
            }
            
            this.initialized = true;
            this.emit('initialized');
            
            this.log('AuthService initialization complete');
            return true;
            
        } catch (error) {
            this.log(`AuthService initialization failed: ${error.message}`);
            this.emit('error', error);
            return false;
        }
    }
    
    async start() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
        }
        
        // Start periodic session checks
        this.sessionTimer = setInterval(async () => {
            await this.validateSession();
        }, this.config.sessionCheckInterval);
        
        this.log('AuthService started with periodic session checks');
        this.emit('started');
    }
    
    async stop() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = null;
        }
        
        this.log('AuthService stopped');
        this.emit('stopped');
    }
    
    async validateSession() {
        try {
            const response = await fetch(`http://localhost:${this.config.chromeDebugPort}/json`, {
                timeout: this.config.connectionTimeout
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const pages = await response.json();
            const claudePage = pages.find(page => 
                (page.url && page.url.includes('claude.ai') && !page.url.includes('login')) ||
                (page.title && page.title.includes('Claude') && page.type === 'page')
            );
            
            const isValid = !!claudePage;
            const wasValid = this.sessionValid;
            
            this.sessionValid = isValid;
            this.lastCheck = Date.now();
            
            if (isValid !== wasValid) {
                this.emit(isValid ? 'session-established' : 'session-lost');
                this.log(`Session status changed: ${isValid ? 'valid' : 'invalid'}`);
            }
            
            return isValid;
            
        } catch (error) {
            const wasValid = this.sessionValid;
            this.sessionValid = false;
            this.lastCheck = Date.now();
            
            if (wasValid) {
                this.emit('session-lost');
                this.log(`Session lost: ${error.message}`);
            }
            
            return false;
        }
    }
    
    getStatus() {
        return {
            initialized: this.initialized,
            sessionValid: this.sessionValid,
            lastCheck: this.lastCheck,
            config: {
                chromeDebugPort: this.config.chromeDebugPort,
                sessionCheckInterval: this.config.sessionCheckInterval
            }
        };
    }
    
    log(message) {
        if (this.config.enableLogging) {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [AuthService] ${message}`);
        }
    }
}

module.exports = AuthService;
