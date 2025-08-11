/**
 * Desktop State Management System
 * Tracks all aspects of Claude Desktop state for intelligent operations
 */
class DesktopState {
    constructor() {
        this.submitButton = { 
            enabled: false, 
            visible: false, 
            lastChecked: null 
        };
        
        this.inputField = { 
            ready: false, 
            content: '', 
            focused: false, 
            lastModified: null 
        };
        
        this.processing = { 
            active: false, 
            type: null, // 'thinking', 'responding', 'complete'
            progress: 0,
            startTime: null,
            anchor: null
        };
        
        this.chatNavigation = { 
            ready: false, 
            activeChat: null,
            chatCount: 0,
            lastNavigation: null
        };
        
        this.errors = { 
            active: false, 
            type: null, // 'rateLimit', 'network', 'ui', 'auth'
            message: '', 
            recoverable: false,
            timestamp: null
        };
        
        this.connection = {
            chromeDebug: false,
            webSocketStreams: 0,
            httpServer: false,
            wsServer: false
        };
        
        this.lastStateUpdate = Date.now();
    }
    
    /**
     * Update a specific state category
     */
    updateState(category, updates) {
        if (this[category]) {
            Object.assign(this[category], updates);
            this.lastStateUpdate = Date.now();
            return true;
        }
        return false;
    }
    
    /**
     * Get complete state snapshot
     */
    getSnapshot() {
        return {
            ...this,
            timestamp: Date.now()
        };
    }
}

module.exports = DesktopState;