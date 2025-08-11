/**
 * Context Service - Context Management and State Tracking
 * 
 * Manages message contexts, conversation state, and cross-request tracking.
 * 
 * @author AI Collaboration
 * @version 2.0.0
 * @date August 9, 2025
 */

const EventEmitter = require('events');

class ContextService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableLogging: true,
            maxContexts: 1000,
            contextTTL: 24 * 60 * 60 * 1000, // 24 hours
            cleanupInterval: 60 * 60 * 1000, // 1 hour
            ...config
        };
        
        this.initialized = false;
        this.contexts = new Map();
        this.cleanupTimer = null;
        
        this.log('ContextService initialized');
    }
    
    async initialize() {
        if (this.initialized) return true;
        
        this._startCleanupTimer();
        
        this.initialized = true;
        this.emit('initialized');
        this.log('ContextService initialization complete');
        return true;
    }
    
    async stop() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        this.log('ContextService stopped');
        this.emit('stopped');
    }
    
    createContext(metadata = {}) {
        const contextId = this._generateContextId();
        
        const context = {
            id: contextId,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            status: 'created',
            source: 'unknown',
            anchor: null,
            messageCount: 0,
            ...metadata
        };
        
        this.contexts.set(contextId, context);
        
        this.emit('context-created', context);
        this.log(`Created context: ${contextId}`);
        
        return context;
    }
    
    getContext(contextId) {
        const context = this.contexts.get(contextId);
        
        if (context) {
            // Update last activity
            context.lastActivity = Date.now();
            this.contexts.set(contextId, context);
        }
        
        return context || null;
    }
    
    updateContext(contextId, updates) {
        const existing = this.contexts.get(contextId);
        if (!existing) {
            this.log(`Warning: Attempting to update unknown context: ${contextId}`);
            return null;
        }
        
        const updated = {
            ...existing,
            ...updates,
            lastActivity: Date.now()
        };
        
        this.contexts.set(contextId, updated);
        
        this.emit('context-updated', { contextId, updates, context: updated });
        this.log(`Updated context: ${contextId}`);
        
        return updated;
    }
    
    deleteContext(contextId) {
        const context = this.contexts.get(contextId);
        if (!context) {
            return false;
        }
        
        this.contexts.delete(contextId);
        
        this.emit('context-deleted', { contextId, context });
        this.log(`Deleted context: ${contextId}`);
        
        return true;
    }
    
    getAllContexts() {
        return Array.from(this.contexts.values());
    }
    
    getActiveContexts(minutes = 60) {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return Array.from(this.contexts.values()).filter(
            context => context.lastActivity >= cutoff
        );
    }
    
    getContextsBySource(source) {
        return Array.from(this.contexts.values()).filter(
            context => context.source === source
        );
    }
    
    cleanupOldContexts() {
        const cutoff = Date.now() - this.config.contextTTL;
        let cleanedCount = 0;
        
        for (const [contextId, context] of this.contexts) {
            if (context.lastActivity < cutoff) {
                this.contexts.delete(contextId);
                cleanedCount++;
                this.log(`Cleaned up old context: ${contextId}`);
            }
        }
        
        if (cleanedCount > 0) {
            this.emit('contexts-cleaned', { count: cleanedCount });
            this.log(`Cleaned up ${cleanedCount} old contexts`);
        }
        
        return cleanedCount;
    }
    
    getStatus() {
        return {
            initialized: this.initialized,
            totalContexts: this.contexts.size,
            activeContexts: this.getActiveContexts().length,
            config: {
                maxContexts: this.config.maxContexts,
                contextTTL: this.config.contextTTL,
                cleanupInterval: this.config.cleanupInterval
            }
        };
    }
    
    _generateContextId() {
        // Use crypto.randomUUID if available, fallback to timestamp + random
        try {
            const crypto = require('crypto');
            if (crypto.randomUUID) {
                return crypto.randomUUID();
            }
        } catch (error) {
            // Crypto not available, fall through to fallback
        }
        
        // Fallback method
        return `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }
    
    _startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        this.cleanupTimer = setInterval(() => {
            this.cleanupOldContexts();
        }, this.config.cleanupInterval);
        
        this.log(`Cleanup timer started (${this.config.cleanupInterval}ms interval)`);
    }
    
    log(message) {
        if (this.config.enableLogging) {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [ContextService] ${message}`);
        }
    }
}

module.exports = ContextService;
