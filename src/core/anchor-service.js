/**
 * Anchor Service - Unique Anchor Generation and Tracking
 * 
 * Manages the new unique anchor system that replaced content-based hashes.
 * Provides reliable anchor generation, tracking, and lifecycle management.
 * 
 * @author AI Collaboration
 * @version 2.0.0
 * @date August 9, 2025
 */

const EventEmitter = require('events');

class AnchorService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableLogging: true,
            cleanupInterval: 300000, // 5 minutes
            maxAgeHours: 24, // 24 hours
            ...config
        };
        
        // Anchor tracking
        this.anchors = new Map(); // anchor -> metadata
        this.cleanupTimer = null;
        
        // Service state
        this.initialized = false;
        
        // Statistics
        this.statistics = {
            totalGenerated: 0,
            totalTracked: 0,
            totalCleaned: 0,
            oldestAnchor: null,
            newestAnchor: null
        };
        
        this.log('AnchorService initialized');
    }
    
    /**
     * Initialize the anchor service
     */
    async initialize() {
        if (this.initialized) {
            this.log('AnchorService already initialized');
            return true;
        }
        
        try {
            this.log('Initializing AnchorService...');
            
            // Start cleanup timer
            this._startCleanupTimer();
            
            this.initialized = true;
            this.emit('initialized');
            
            this.log('AnchorService initialization complete');
            return true;
            
        } catch (error) {
            this.log(`AnchorService initialization failed: ${error.message}`);
            this.emit('error', error);
            return false;
        }
    }
    
    /**
     * Generate unique anchor using timestamp + random ID
     */
    generateAnchor() {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const anchor = `msg_${timestamp}_${randomId}`;
        
        this.statistics.totalGenerated++;
        this._updateStatistics(anchor);
        
        this.emit('anchor-generated', { anchor, timestamp });
        this.log(`Generated anchor: ${anchor}`);
        
        return anchor;
    }
    
    /**
     * Track an anchor with metadata
     */
    trackAnchor(anchor, metadata = {}) {
        const trackingData = {
            anchor,
            createdAt: Date.now(),
            status: 'created',
            contextId: null,
            injectionResult: null,
            extractionResult: null,
            lastActivity: Date.now(),
            ...metadata
        };
        
        this.anchors.set(anchor, trackingData);
        this.statistics.totalTracked++;
        
        this.emit('anchor-tracked', { anchor, metadata: trackingData });
        this.log(`Tracking anchor: ${anchor}`);
        
        return trackingData;
    }
    
    /**
     * Update anchor metadata
     */
    updateAnchor(anchor, updates) {
        const existing = this.anchors.get(anchor);
        if (!existing) {
            this.log(`Warning: Attempting to update unknown anchor: ${anchor}`);
            return null;
        }
        
        const updated = {
            ...existing,
            ...updates,
            lastActivity: Date.now()
        };
        
        this.anchors.set(anchor, updated);
        
        this.emit('anchor-updated', { anchor, updates, metadata: updated });
        this.log(`Updated anchor: ${anchor}`);
        
        return updated;
    }
    
    /**
     * Get anchor metadata
     */
    getAnchor(anchor) {
        return this.anchors.get(anchor) || null;
    }
    
    /**
     * Get all tracked anchors
     */
    getAllAnchors() {
        return Array.from(this.anchors.values());
    }
    
    /**
     * Get anchors by status
     */
    getAnchorsByStatus(status) {
        return Array.from(this.anchors.values()).filter(
            anchor => anchor.status === status
        );
    }
    
    /**
     * Get recent anchors (within last N minutes)
     */
    getRecentAnchors(minutes = 60) {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return Array.from(this.anchors.values()).filter(
            anchor => anchor.lastActivity >= cutoff
        );
    }
    
    /**
     * Extract timestamp from anchor
     */
    extractTimestamp(anchor) {
        const match = anchor.match(/msg_(\d+)_/);
        return match ? parseInt(match[1]) : null;
    }
    
    /**
     * Validate anchor format
     */
    isValidAnchor(anchor) {
        if (typeof anchor !== 'string') return false;
        
        // New format: msg_TIMESTAMP_RANDOMID
        const newFormat = /^msg_\d{13}_[a-z0-9]{6}$/;
        
        // Legacy format: msg_TIMESTAMP_CONTENT (for backward compatibility)
        const legacyFormat = /^msg_\d{13}_[a-zA-Z0-9]+$/;
        
        return newFormat.test(anchor) || legacyFormat.test(anchor);
    }
    
    /**
     * Get anchor age in milliseconds
     */
    getAnchorAge(anchor) {
        const timestamp = this.extractTimestamp(anchor);
        return timestamp ? Date.now() - timestamp : null;
    }
    
    /**
     * Clean up old anchors
     */
    cleanupOldAnchors() {
        const maxAge = this.config.maxAgeHours * 60 * 60 * 1000;
        const cutoff = Date.now() - maxAge;
        let cleanedCount = 0;
        
        for (const [anchor, metadata] of this.anchors) {
            if (metadata.lastActivity < cutoff) {
                this.anchors.delete(anchor);
                cleanedCount++;
                this.log(`Cleaned up old anchor: ${anchor}`);
            }
        }
        
        this.statistics.totalCleaned += cleanedCount;
        
        if (cleanedCount > 0) {
            this.emit('anchors-cleaned', { count: cleanedCount });
            this.log(`Cleaned up ${cleanedCount} old anchors`);
        }
        
        return cleanedCount;
    }
    
    /**
     * Get service status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            totalAnchors: this.anchors.size,
            statistics: { ...this.statistics },
            oldestAnchor: this._getOldestAnchor(),
            newestAnchor: this._getNewestAnchor(),
            config: {
                cleanupInterval: this.config.cleanupInterval,
                maxAgeHours: this.config.maxAgeHours
            }
        };
    }
    
    /**
     * Get detailed statistics
     */
    getStatistics() {
        const recentCount = this.getRecentAnchors(60).length; // Last hour
        const statusCounts = this._getStatusCounts();
        
        return {
            ...this.statistics,
            currentlyTracked: this.anchors.size,
            recentAnchors: recentCount,
            statusBreakdown: statusCounts,
            averageAge: this._getAverageAge(),
            memoryUsage: this._estimateMemoryUsage()
        };
    }
    
    /**
     * Reset statistics (but keep tracked anchors)
     */
    resetStatistics() {
        this.statistics = {
            totalGenerated: 0,
            totalTracked: 0,
            totalCleaned: 0,
            oldestAnchor: null,
            newestAnchor: null
        };
        
        this.log('Statistics reset');
        this.emit('statistics-reset');
    }
    
    /**
     * Stop the anchor service
     */
    async stop() {
        this.log('Stopping AnchorService...');
        
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        this.emit('stopped');
        this.log('AnchorService stopped');
    }
    
    /**
     * Private helper methods
     */
    _startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        this.cleanupTimer = setInterval(() => {
            this.cleanupOldAnchors();
        }, this.config.cleanupInterval);
        
        this.log(`Cleanup timer started (${this.config.cleanupInterval}ms interval)`);
    }
    
    _updateStatistics(anchor) {
        const timestamp = this.extractTimestamp(anchor);
        
        if (!this.statistics.oldestAnchor || timestamp < this.extractTimestamp(this.statistics.oldestAnchor)) {
            this.statistics.oldestAnchor = anchor;
        }
        
        if (!this.statistics.newestAnchor || timestamp > this.extractTimestamp(this.statistics.newestAnchor)) {
            this.statistics.newestAnchor = anchor;
        }
    }
    
    _getOldestAnchor() {
        let oldest = null;
        let oldestTimestamp = Date.now();
        
        for (const [anchor, metadata] of this.anchors) {
            const timestamp = this.extractTimestamp(anchor);
            if (timestamp && timestamp < oldestTimestamp) {
                oldestTimestamp = timestamp;
                oldest = anchor;
            }
        }
        
        return oldest;
    }
    
    _getNewestAnchor() {
        let newest = null;
        let newestTimestamp = 0;
        
        for (const [anchor, metadata] of this.anchors) {
            const timestamp = this.extractTimestamp(anchor);
            if (timestamp && timestamp > newestTimestamp) {
                newestTimestamp = timestamp;
                newest = anchor;
            }
        }
        
        return newest;
    }
    
    _getStatusCounts() {
        const counts = {};
        
        for (const metadata of this.anchors.values()) {
            const status = metadata.status || 'unknown';
            counts[status] = (counts[status] || 0) + 1;
        }
        
        return counts;
    }
    
    _getAverageAge() {
        if (this.anchors.size === 0) return 0;
        
        let totalAge = 0;
        let count = 0;
        
        for (const anchor of this.anchors.keys()) {
            const age = this.getAnchorAge(anchor);
            if (age !== null) {
                totalAge += age;
                count++;
            }
        }
        
        return count > 0 ? totalAge / count : 0;
    }
    
    _estimateMemoryUsage() {
        // Rough estimation of memory usage
        const avgMetadataSize = 200; // bytes per anchor metadata
        return this.anchors.size * avgMetadataSize;
    }
    
    log(message) {
        if (this.config.enableLogging) {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [AnchorService] ${message}`);
        }
    }
}

module.exports = AnchorService;
