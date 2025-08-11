/**
 * Plugin Manager - Plugin Lifecycle Management
 * 
 * Manages plugin registration, initialization, and lifecycle.
 * Provides centralized control over all interface plugins.
 * 
 * @author AI Collaboration
 * @version 2.0.0
 * @date August 9, 2025
 */

const EventEmitter = require('events');

class PluginManager extends EventEmitter {
    constructor(core, config = {}) {
        super();
        
        this.core = core;
        this.config = {
            enableLogging: true,
            autoStart: true,
            maxPlugins: 10,
            ...config
        };
        
        this.plugins = new Map(); // name -> plugin instance
        this.pluginConfigs = new Map(); // name -> config
        this.initialized = false;
        
        this.log('PluginManager initialized');
    }
    
    /**
     * Initialize the plugin manager
     */
    async initialize() {
        if (this.initialized) {
            this.log('PluginManager already initialized');
            return true;
        }
        
        try {
            this.log('Initializing PluginManager...');
            
            this.initialized = true;
            this.emit('initialized');
            
            this.log('PluginManager initialization complete');
            return true;
            
        } catch (error) {
            this.log(`PluginManager initialization failed: ${error.message}`);
            this.emit('error', error);
            return false;
        }
    }
    
    /**
     * Register a plugin
     */
    async registerPlugin(PluginClass, config = {}) {
        if (!this.initialized) {
            throw new Error('PluginManager must be initialized before registering plugins');
        }
        
        if (this.plugins.size >= this.config.maxPlugins) {
            throw new Error(`Maximum number of plugins (${this.config.maxPlugins}) reached`);
        }
        
        try {
            // Create plugin instance
            const plugin = new PluginClass(config);
            
            if (!plugin.name) {
                throw new Error('Plugin must have a name');
            }
            
            if (this.plugins.has(plugin.name)) {
                throw new Error(`Plugin ${plugin.name} already registered`);
            }
            
            // Register with core
            this.core.registerPlugin(plugin);
            
            // Initialize plugin
            await plugin.initialize();
            
            // Store plugin and config
            this.plugins.set(plugin.name, plugin);
            this.pluginConfigs.set(plugin.name, config);
            
            // Set up event forwarding
            this._setupPluginEvents(plugin);
            
            this.log(`Plugin registered and initialized: ${plugin.name}`);
            this.emit('plugin-registered', plugin);
            
            // Auto-start if enabled
            if (this.config.autoStart && config.enabled !== false) {
                await this.startPlugin(plugin.name);
            }
            
            return plugin;
            
        } catch (error) {
            this.log(`Plugin registration failed: ${error.message}`);
            this.emit('plugin-registration-error', { PluginClass, config, error });
            throw error;
        }
    }
    
    /**
     * Unregister a plugin
     */
    async unregisterPlugin(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            throw new Error(`Plugin ${name} not found`);
        }
        
        try {
            // Stop plugin if running
            if (plugin.running) {
                await plugin.stop();
            }
            
            // Unregister from core
            this.core.unregisterPlugin(name);
            
            // Remove from manager
            this.plugins.delete(name);
            this.pluginConfigs.delete(name);
            
            this.log(`Plugin unregistered: ${name}`);
            this.emit('plugin-unregistered', plugin);
            
            return true;
            
        } catch (error) {
            this.log(`Plugin unregistration failed: ${error.message}`);
            this.emit('plugin-unregistration-error', { name, error });
            throw error;
        }
    }
    
    /**
     * Start a specific plugin
     */
    async startPlugin(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            throw new Error(`Plugin ${name} not found`);
        }
        
        try {
            await plugin.start();
            this.log(`Plugin started: ${name}`);
            this.emit('plugin-started', plugin);
            return true;
            
        } catch (error) {
            this.log(`Plugin start failed: ${error.message}`);
            this.emit('plugin-start-error', { name, error });
            throw error;
        }
    }
    
    /**
     * Stop a specific plugin
     */
    async stopPlugin(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            throw new Error(`Plugin ${name} not found`);
        }
        
        try {
            await plugin.stop();
            this.log(`Plugin stopped: ${name}`);
            this.emit('plugin-stopped', plugin);
            return true;
            
        } catch (error) {
            this.log(`Plugin stop failed: ${error.message}`);
            this.emit('plugin-stop-error', { name, error });
            throw error;
        }
    }
    
    /**
     * Start all registered plugins
     */
    async startAllPlugins() {
        const results = [];
        
        for (const [name, plugin] of this.plugins) {
            try {
                if (!plugin.running) {
                    await this.startPlugin(name);
                    results.push({ name, success: true });
                } else {
                    results.push({ name, success: true, message: 'Already running' });
                }
            } catch (error) {
                results.push({ name, success: false, error: error.message });
            }
        }
        
        this.log(`Started all plugins: ${results.filter(r => r.success).length}/${results.length} successful`);
        return results;
    }
    
    /**
     * Stop all running plugins
     */
    async stopAllPlugins() {
        const results = [];
        
        for (const [name, plugin] of this.plugins) {
            try {
                if (plugin.running) {
                    await this.stopPlugin(name);
                    results.push({ name, success: true });
                } else {
                    results.push({ name, success: true, message: 'Not running' });
                }
            } catch (error) {
                results.push({ name, success: false, error: error.message });
            }
        }
        
        this.log(`Stopped all plugins: ${results.filter(r => r.success).length}/${results.length} successful`);
        return results;
    }
    
    /**
     * Get plugin by name
     */
    getPlugin(name) {
        return this.plugins.get(name) || null;
    }
    
    /**
     * Get all registered plugins
     */
    getAllPlugins() {
        return Array.from(this.plugins.values());
    }
    
    /**
     * Get running plugins
     */
    getRunningPlugins() {
        return Array.from(this.plugins.values()).filter(plugin => plugin.running);
    }
    
    /**
     * Get plugin status by name
     */
    getPluginStatus(name) {
        const plugin = this.plugins.get(name);
        return plugin ? plugin.getStatus() : null;
    }
    
    /**
     * Get status of all plugins
     */
    getAllPluginStatus() {
        const status = {};
        for (const [name, plugin] of this.plugins) {
            status[name] = plugin.getStatus();
        }
        return status;
    }
    
    /**
     * Get manager status
     */
    getStatus() {
        const runningCount = this.getRunningPlugins().length;
        
        return {
            initialized: this.initialized,
            totalPlugins: this.plugins.size,
            runningPlugins: runningCount,
            maxPlugins: this.config.maxPlugins,
            autoStart: this.config.autoStart,
            plugins: this.getAllPluginStatus()
        };
    }
    
    /**
     * Reload a plugin (stop, unregister, register, start)
     */
    async reloadPlugin(name, PluginClass, config) {
        this.log(`Reloading plugin: ${name}`);
        
        try {
            // Stop and unregister if exists
            if (this.plugins.has(name)) {
                await this.stopPlugin(name);
                await this.unregisterPlugin(name);
            }
            
            // Register and start new instance
            const plugin = await this.registerPlugin(PluginClass, config);
            
            this.log(`Plugin reloaded successfully: ${name}`);
            this.emit('plugin-reloaded', plugin);
            
            return plugin;
            
        } catch (error) {
            this.log(`Plugin reload failed: ${error.message}`);
            this.emit('plugin-reload-error', { name, error });
            throw error;
        }
    }
    
    /**
     * Shutdown the plugin manager
     */
    async shutdown() {
        this.log('Shutting down PluginManager...');
        
        try {
            // Stop all plugins
            await this.stopAllPlugins();
            
            // Unregister all plugins
            const pluginNames = Array.from(this.plugins.keys());
            for (const name of pluginNames) {
                await this.unregisterPlugin(name);
            }
            
            this.emit('shutdown');
            this.log('PluginManager shutdown complete');
            
        } catch (error) {
            this.log(`PluginManager shutdown failed: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * Set up event forwarding for a plugin
     */
    _setupPluginEvents(plugin) {
        // Forward all plugin events with plugin name prefix
        const events = ['error', 'message-handled', 'response-sent', 'message-error', 'response-error'];
        
        events.forEach(event => {
            plugin.on(event, (data) => {
                this.emit(`plugin-${event}`, { plugin: plugin.name, data });
            });
        });
    }
    
    /**
     * Logging helper
     */
    log(message) {
        if (this.config.enableLogging) {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [PluginManager] ${message}`);
        }
    }
}

module.exports = PluginManager;
