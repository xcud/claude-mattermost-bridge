/**
 * Observation Methods Module
 * Handles all desktop state observation operations for Claude Desktop Interface
 */

const DOMObserver = require('./dom-observer');

class ObservationMethods {
    constructor(desktopState, connectionManager) {
        this.state = desktopState;
        this.connections = connectionManager;
        this.domObserver = new DOMObserver(connectionManager.config.chromeDebugPort);
    }
    
    /**
     * Get submit button state
     */
    async getSubmitButtonState() {
        try {
            // Try to get real-time state first
            const observedState = await this.domObserver.observeSubmitButtonState();
            
            // Update internal state
            this.state.updateState('submitButton', {
                enabled: observedState.enabled,
                visible: observedState.visible,
                lastChecked: observedState.timestamp,
                selector: observedState.selector
            });
            
            return {
                ...observedState,
                cached: false,
                source: 'real-time'
            };
            
        } catch (error) {
            console.warn('Failed to get real-time submit button state, using cached:', error.message);
            
            // Return cached state with error info
            return {
                ...this.state.submitButton,
                cached: true,
                source: 'cached',
                error: error.message
            };
        }
    }
    
    /**
     * Get input field state
     */
    async getInputFieldState() {
        try {
            // Try to get real-time state first
            const observedState = await this.domObserver.observeInputFieldState();
            
            // Update internal state
            this.state.updateState('inputField', {
                ready: observedState.ready,
                content: observedState.content,
                focused: observedState.focused,
                lastModified: observedState.timestamp,
                selector: observedState.selector,
                type: observedState.type,
                contentLength: observedState.contentLength
            });
            
            return {
                ...observedState,
                cached: false,
                source: 'real-time'
            };
            
        } catch (error) {
            console.warn('Failed to get real-time input field state, using cached:', error.message);
            
            // Return cached state with error info
            return {
                ...this.state.inputField,
                cached: true,
                source: 'cached',
                error: error.message
            };
        }
    }
    
    /**
     * Get processing state
     */
    async getProcessingState() {
        try {
            // Try to get real-time state first
            const observedState = await this.domObserver.observeProcessingState();
            
            // Update internal state
            this.state.updateState('processing', {
                active: observedState.active,
                type: observedState.type,
                progress: observedState.active ? 
                    (observedState.type === 'thinking' ? 25 : 
                     observedState.type === 'responding' ? 50 : 
                     observedState.type === 'generating' ? 75 : 100) : 100,
                lastCheck: observedState.timestamp,
                hasLoadingIndicators: observedState.hasLoadingIndicators,
                submitDisabled: observedState.submitDisabled
            });
            
            return {
                ...observedState,
                cached: false,
                source: 'real-time'
            };
            
        } catch (error) {
            console.warn('Failed to get real-time processing state, using cached:', error.message);
            
            // Return cached state with error info
            return {
                ...this.state.processing,
                cached: true,
                source: 'cached',
                error: error.message
            };
        }
    }    
    /**
     * Get chat navigation state
     */
    async getChatNavigationState() {
        try {
            // Try to get real-time state first
            const observedState = await this.domObserver.observeChatNavigationState();
            
            // Update internal state
            this.state.updateState('chatNavigation', {
                ready: observedState.ready,
                chatCount: observedState.chatCount,
                activeChat: observedState.activeChat,
                lastNavigation: observedState.timestamp,
                hasNewChatButton: observedState.hasNewChatButton,
                newChatAvailable: observedState.newChatAvailable,
                selector: observedState.selector
            });
            
            return {
                ...observedState,
                cached: false,
                source: 'real-time'
            };
            
        } catch (error) {
            console.warn('Failed to get real-time chat navigation state, using cached:', error.message);
            
            // Return cached state with error info
            return {
                ...this.state.chatNavigation,
                cached: true,
                source: 'cached',
                error: error.message
            };
        }
    }
    
    /**
     * Detect error states
     */
    async detectErrorStates() {
        try {
            // Check all UI elements for error indicators
            const pages = await this.domObserver.getPages();
            const claudePage = this.domObserver.findClaudePage(pages);
            
            if (!claudePage) {
                throw new Error('Could not find Claude page');
            }
            
            const errorDetectionQuery = `
            (function() {
                // Look for error messages or indicators
                const errorSelectors = [
                    '[data-testid*="error"]',
                    '.error',
                    '.alert-error',
                    '[role="alert"]',
                    '.notification-error',
                    '[aria-label*="error"]'
                ];
                
                let errorElements = [];
                let errorMessages = [];
                
                for (const selector of errorSelectors) {
                    try {
                        const elements = Array.from(document.querySelectorAll(selector));
                        errorElements = errorElements.concat(elements);
                        errorMessages = errorMessages.concat(
                            elements.map(el => el.textContent || el.innerText)
                        );
                    } catch (e) {
                        // Continue
                    }
                }
                
                // Check for rate limiting indicators
                const bodyText = document.body.innerText.toLowerCase();
                const hasRateLimit = bodyText.includes('rate limit') || 
                                     bodyText.includes('too many requests') ||
                                     bodyText.includes('please wait');
                
                // Check for network/connection errors
                const hasNetworkError = bodyText.includes('network error') ||
                                        bodyText.includes('connection failed') ||
                                        bodyText.includes('offline');
                
                return {
                    active: errorElements.length > 0 || hasRateLimit || hasNetworkError,
                    type: hasRateLimit ? 'rateLimit' : 
                          hasNetworkError ? 'network' : 
                          errorElements.length > 0 ? 'ui' : null,
                    messages: errorMessages.filter(msg => msg && msg.length > 0),
                    elementCount: errorElements.length,
                    recoverable: !hasNetworkError, // Network errors often require manual intervention
                    timestamp: Date.now()
                };
            })();
            `;
            
            const result = await this.domObserver.executeJavaScript(claudePage.webSocketDebuggerUrl, errorDetectionQuery);
            
            if (result) {
                // Update error state
                this.state.updateState('errors', {
                    active: result.active,
                    type: result.type,
                    message: result.messages.join('; '),
                    recoverable: result.recoverable,
                    timestamp: result.timestamp
                });
                
                return {
                    ...result,
                    cached: false,
                    source: 'real-time'
                };
            } else {
                return {
                    ...this.state.errors,
                    cached: true,
                    source: 'cached'
                };
            }
            
        } catch (error) {
            console.warn('Failed to detect error states, using cached:', error.message);
            
            return {
                ...this.state.errors,
                cached: true,
                source: 'cached',
                error: error.message
            };
        }
    }
    
    /**
     * Wait for specific state condition
     */
    async waitForState(category, condition, timeout = 30000) {
        console.log(`Waiting for ${category} state: ${condition} (timeout: ${timeout}ms)`);
        
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            const checkState = async () => {
                const elapsed = Date.now() - startTime;
                
                if (elapsed >= timeout) {
                    resolve({
                        success: false,
                        message: `Timeout waiting for ${category} state: ${condition}`,
                        elapsed: elapsed,
                        timestamp: Date.now()
                    });
                    return;
                }
                
                try {
                    let currentState;
                    
                    // Get current state based on category
                    switch (category) {
                        case 'submitButton':
                            currentState = await this.getSubmitButtonState();
                            break;
                        case 'inputField':
                            currentState = await this.getInputFieldState();
                            break;
                        case 'processing':
                            currentState = await this.getProcessingState();
                            break;
                        case 'chatNavigation':
                            currentState = await this.getChatNavigationState();
                            break;
                        default:
                            resolve({
                                success: false,
                                message: `Unknown state category: ${category}`,
                                elapsed: elapsed,
                                timestamp: Date.now()
                            });
                            return;
                    }
                    
                    // Check condition
                    let conditionMet = false;
                    
                    if (condition === 'ready' && currentState.ready === true) {
                        conditionMet = true;
                    } else if (condition === 'enabled' && currentState.enabled === true) {
                        conditionMet = true;
                    } else if (condition === 'complete' && currentState.active === false) {
                        conditionMet = true;
                    } else if (condition === 'active' && currentState.active === true) {
                        conditionMet = true;
                    }
                    
                    if (conditionMet) {
                        resolve({
                            success: true,
                            message: `State condition met: ${category}.${condition}`,
                            elapsed: elapsed,
                            state: currentState,
                            timestamp: Date.now()
                        });
                    } else {
                        // Continue checking
                        setTimeout(checkState, 500);
                    }
                    
                } catch (error) {
                    resolve({
                        success: false,
                        message: `Error checking state: ${error.message}`,
                        elapsed: elapsed,
                        timestamp: Date.now()
                    });
                }
            };
            
            checkState();
        });
    }
}

module.exports = ObservationMethods;