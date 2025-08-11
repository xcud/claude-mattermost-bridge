/**
 * State Monitor Manager
 * Manages all state monitoring operations and triggers
 */
const DOMObserver = require('./dom-observer');

class StateMonitorManager {
    constructor(desktopState, connectionManager) {
        this.state = desktopState;
        this.connections = connectionManager;
        this.domObserver = new DOMObserver(connectionManager.config.chromeDebugPort);
        this.monitors = new Map(); // monitorType -> interval/observer
        this.config = {
            submitButtonInterval: 1000,
            inputFieldInterval: 500,
            processingInterval: 2000,
            chatNavigationInterval: 3000
        };
        this.enabled = false;
    }
    
    /**
     * Start all state monitors
     */
    startAllMonitors() {
        if (this.enabled) {
            console.log('State monitors already running');
            return;
        }
        
        console.log('Starting all desktop state monitors...');
        this.enabled = true;
        
        this.startSubmitButtonMonitor();
        this.startInputFieldMonitor();
        this.startProcessingMonitor();
        this.startChatNavigationMonitor();
        
        console.log('All desktop state monitors started');
    }
    
    /**
     * Monitor submit button state
     */
    startSubmitButtonMonitor() {
        if (this.monitors.has('submitButton')) {
            return;
        }
        
        const monitorSubmitButton = async () => {
            if (!this.enabled) return;
            
            try {
                const submitState = await this.domObserver.observeSubmitButtonState();
                
                // Update state if changed
                const currentState = this.state.submitButton;
                if (currentState.enabled !== submitState.enabled || 
                    currentState.visible !== submitState.visible) {
                    
                    this.state.updateState('submitButton', {
                        enabled: submitState.enabled,
                        visible: submitState.visible,
                        lastChecked: submitState.timestamp,
                        selector: submitState.selector,
                        error: submitState.error
                    });
                    
                    console.log(`Submit button state changed: enabled=${submitState.enabled}, visible=${submitState.visible}`);
                }
            } catch (error) {
                console.error('Submit button monitoring error:', error.message);
                this.state.updateState('submitButton', {
                    enabled: false,
                    visible: false,
                    lastChecked: Date.now(),
                    error: error.message
                });
            }
        };
        
        // Initial check
        monitorSubmitButton();
        
        // Set up interval
        const interval = setInterval(monitorSubmitButton, this.config.submitButtonInterval);
        this.monitors.set('submitButton', { interval, type: 'submitButton' });
    }

    /**
     * Monitor input field state
     */
    startInputFieldMonitor() {
        if (this.monitors.has('inputField')) {
            return;
        }
        
        const monitorInputField = async () => {
            if (!this.enabled) return;
            
            try {
                const inputState = await this.domObserver.observeInputFieldState();
                
                // Update state if changed
                const currentState = this.state.inputField;
                if (currentState.available !== inputState.available || 
                    currentState.focused !== inputState.focused ||
                    currentState.hasContent !== inputState.hasContent) {
                    
                    this.state.updateState('inputField', {
                        available: inputState.available,
                        focused: inputState.focused,
                        hasContent: inputState.hasContent,
                        lastChecked: inputState.timestamp,
                        selector: inputState.selector,
                        error: inputState.error
                    });
                    
                    console.log(`Input field state changed: available=${inputState.available}, focused=${inputState.focused}, hasContent=${inputState.hasContent}`);
                }
            } catch (error) {
                console.error('Input field monitoring error:', error.message);
                this.state.updateState('inputField', {
                    available: false,
                    focused: false,
                    hasContent: false,
                    lastChecked: Date.now(),
                    error: error.message
                });
            }
        };
        
        // Initial check
        monitorInputField();
        
        // Set up interval
        const interval = setInterval(monitorInputField, this.config.inputFieldInterval);
        this.monitors.set('inputField', { interval, type: 'inputField' });
    }

    /**
     * Monitor processing state
     */
    startProcessingMonitor() {
        if (this.monitors.has('processing')) {
            return;
        }
        
        const monitorProcessing = async () => {
            if (!this.enabled) return;
            
            try {
                const processingState = await this.domObserver.observeProcessingState();
                
                // Update state if changed
                const currentState = this.state.processing;
                if (currentState.isProcessing !== processingState.isProcessing || 
                    currentState.stage !== processingState.stage) {
                    
                    this.state.updateState('processing', {
                        isProcessing: processingState.isProcessing,
                        stage: processingState.stage,
                        lastChecked: processingState.timestamp,
                        indicators: processingState.indicators,
                        error: processingState.error
                    });
                    
                    console.log(`Processing state changed: isProcessing=${processingState.isProcessing}, stage=${processingState.stage}`);
                }
            } catch (error) {
                console.error('Processing monitoring error:', error.message);
                this.state.updateState('processing', {
                    isProcessing: false,
                    stage: 'unknown',
                    lastChecked: Date.now(),
                    error: error.message
                });
            }
        };
        
        // Initial check
        monitorProcessing();
        
        // Set up interval
        const interval = setInterval(monitorProcessing, this.config.processingInterval);
        this.monitors.set('processing', { interval, type: 'processing' });
    }

    /**
     * Monitor chat navigation state
     */
    startChatNavigationMonitor() {
        if (this.monitors.has('chatNavigation')) {
            return;
        }
        
        const monitorChatNavigation = async () => {
            if (!this.enabled) return;
            
            try {
                const navState = await this.domObserver.observeChatNavigationState();
                
                // Update state if changed
                const currentState = this.state.chatNavigation;
                if (currentState.currentChatId !== navState.currentChatId || 
                    currentState.chatCount !== navState.chatCount) {
                    
                    this.state.updateState('chatNavigation', {
                        currentChatId: navState.currentChatId,
                        chatCount: navState.chatCount,
                        availableChats: navState.availableChats,
                        lastChecked: navState.timestamp,
                        error: navState.error
                    });
                    
                    console.log(`Chat navigation state changed: currentChatId=${navState.currentChatId}, chatCount=${navState.chatCount}`);
                }
            } catch (error) {
                console.error('Chat navigation monitoring error:', error.message);
                this.state.updateState('chatNavigation', {
                    currentChatId: null,
                    chatCount: 0,
                    availableChats: [],
                    lastChecked: Date.now(),
                    error: error.message
                });
            }
        };
        
        // Initial check
        monitorChatNavigation();
        
        // Set up interval
        const interval = setInterval(monitorChatNavigation, this.config.chatNavigationInterval);
        this.monitors.set('chatNavigation', { interval, type: 'chatNavigation' });
    }

    /**
     * Stop all monitors
     */
    stopAllMonitors() {
        if (!this.enabled) {
            console.log('State monitors already stopped');
            return;
        }
        
        console.log('Stopping all desktop state monitors...');
        this.enabled = false;
        
        // Clear all intervals
        for (const [monitorType, monitor] of this.monitors) {
            if (monitor.interval) {
                clearInterval(monitor.interval);
                console.log(`Stopped ${monitorType} monitor`);
            }
        }
        
        this.monitors.clear();
        console.log('All desktop state monitors stopped');
    }

    /**
     * Stop specific monitor
     */
    stopMonitor(monitorType) {
        const monitor = this.monitors.get(monitorType);
        if (monitor && monitor.interval) {
            clearInterval(monitor.interval);
            this.monitors.delete(monitorType);
            console.log(`Stopped ${monitorType} monitor`);
            return true;
        }
        return false;
    }

    /**
     * Get monitor status
     */
    getMonitorStatus() {
        const status = {
            enabled: this.enabled,
            activeMonitors: Array.from(this.monitors.keys()),
            config: this.config
        };
        return status;
    }
}

module.exports = StateMonitorManager;