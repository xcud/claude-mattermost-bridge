/**
 * Control Methods Module
 * Handles all DOM control operations for Claude Desktop Interface
 */

const DOMInjector = require('./dom-injector');

class ControlMethods {
    constructor(desktopState, connectionManager, webSocketExtractor = null) {
        this.state = desktopState;
        this.connections = connectionManager;
        this.domInjector = new DOMInjector(connectionManager.config.chromeDebugPort);
        this.webSocketExtractor = webSocketExtractor; // For tracking injections
    }
    
    /**
     * Inject message into Claude Desktop input field
     * Enhanced with state awareness and error handling
     */
    async injectMessage(message, options = {}) {
        console.log(`Injecting message: ${message.substring(0, 100)}...`);
        
        try {
            // Update processing state
            this.state.updateState('processing', {
                active: true,
                type: 'injecting',
                startTime: Date.now()
            });
            
            // Perform DOM injection
            const result = await this.domInjector.injectMessage(message);
            
            // Track injection timestamp for response monitoring
            if (this.webSocketExtractor && result.anchor) {
                this.webSocketExtractor.trackInjection(result.anchor);
            }
            
            // Update state with success
            this.state.updateState('processing', {
                active: true,
                type: 'responding',
                anchor: result.anchor
            });
            
            return {
                success: true,
                message: 'Message injected successfully',
                anchor: result.anchor,
                method: result.method,
                timestamp: result.timestamp
            };
            
        } catch (error) {
            // Update error state
            this.state.updateState('errors', {
                active: true,
                type: 'injection',
                message: error.message,
                recoverable: true,
                timestamp: Date.now()
            });
            
            this.state.updateState('processing', {
                active: false,
                type: null
            });
            
            return {
                success: false,
                message: `Message injection failed: ${error.message}`,
                anchor: null,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Create new chat context
     */
    async createNewChat(contextData = null) {
        console.log('Creating new chat context...');
        
        try {
            // Update navigation state
            this.state.updateState('chatNavigation', {
                ready: false,
                lastNavigation: Date.now()
            });
            
            // Perform new chat creation
            const result = await this.domInjector.createNewChat();
            
            // Update navigation state with success
            this.state.updateState('chatNavigation', {
                ready: true,
                activeChat: result.chatId,
                chatCount: this.state.chatNavigation.chatCount + 1
            });
            
            return {
                success: true,
                chatId: result.chatId,
                method: result.method,
                message: 'New chat created successfully',
                timestamp: result.timestamp
            };
            
        } catch (error) {
            // Update error state
            this.state.updateState('errors', {
                active: true,
                type: 'navigation',
                message: error.message,
                recoverable: true,
                timestamp: Date.now()
            });
            
            this.state.updateState('chatNavigation', {
                ready: false
            });
            
            return {
                success: false,
                chatId: null,
                message: `Chat creation failed: ${error.message}`,
                timestamp: Date.now()
            };
        }
    }    
    /**
     * Navigate to specific chat
     */
    async navigateToChat(chatId) {
        console.log(`Navigating to chat: ${chatId}`);
        
        try {
            // Update navigation state
            this.state.updateState('chatNavigation', {
                ready: false,
                lastNavigation: Date.now()
            });
            
            // JavaScript to navigate to specific chat
            const navigationCode = `
            (async function() {
                // Look for chat links or conversation history
                const chatSelectors = [
                    \`a[href*="${chatId}"]\`,
                    \`[data-conversation-id="${chatId}"]\`,
                    \`.conversation[data-id="${chatId}"]\`,
                    \`li[data-chat-id="${chatId}"]\`
                ];
                
                let chatElement = null;
                for (const selector of chatSelectors) {
                    try {
                        chatElement = document.querySelector(selector);
                        if (chatElement) {
                            console.log('Found chat element with selector:', selector);
                            break;
                        }
                    } catch (e) {
                        // Continue to next selector
                    }
                }
                
                if (chatElement) {
                    chatElement.click();
                    return { success: true, method: 'chat_click' };
                } else {
                    // Try direct URL navigation
                    window.location.href = \`/chat/${chatId}\`;
                    return { success: true, method: 'url_navigation' };
                }
            })();
            `;
            
            const pages = await this.domInjector.getPages();
            const claudePage = this.domInjector.findClaudePage(pages);
            
            if (!claudePage) {
                throw new Error('Could not find Claude page');
            }
            
            const result = await this.domInjector.executeJavaScript(
                claudePage.webSocketDebuggerUrl, 
                navigationCode
            );
            
            // Update navigation state with success
            this.state.updateState('chatNavigation', {
                ready: true,
                activeChat: chatId
            });
            
            return {
                success: true,
                chatId: chatId,
                method: result?.method || 'unknown',
                message: 'Navigation completed successfully',
                timestamp: Date.now()
            };
            
        } catch (error) {
            this.state.updateState('errors', {
                active: true,
                type: 'navigation',
                message: error.message,
                recoverable: true,
                timestamp: Date.now()
            });
            
            return {
                success: false,
                chatId: chatId,
                message: `Navigation failed: ${error.message}`,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Clear input field
     */
    async clearInputField() {
        console.log('Clearing input field...');
        
        try {
            const clearCode = `
            (async function() {
                const selectors = [
                    'textarea[placeholder*="message"]',
                    'textarea[placeholder*="Message"]',
                    'div[contenteditable="true"]',
                    'textarea[data-testid*="input"]',
                    'textarea[aria-label*="message"]',
                    '.ProseMirror',
                    '[data-testid="chat-input"]',
                    'textarea',
                    'div[role="textbox"]'
                ];
                
                let inputElement = null;
                for (const selector of selectors) {
                    inputElement = document.querySelector(selector);
                    if (inputElement) break;
                }
                
                if (!inputElement) {
                    throw new Error('Could not find input element');
                }
                
                if (inputElement.tagName.toLowerCase() === 'textarea') {
                    inputElement.value = '';
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    inputElement.textContent = '';
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                return { success: true };
            })();
            `;
            
            const pages = await this.domInjector.getPages();
            const claudePage = this.domInjector.findClaudePage(pages);
            
            if (!claudePage) {
                throw new Error('Could not find Claude page');
            }
            
            await this.domInjector.executeJavaScript(claudePage.webSocketDebuggerUrl, clearCode);
            
            // Update input field state
            this.state.updateState('inputField', {
                content: '',
                lastModified: Date.now()
            });
            
            return {
                success: true,
                message: 'Input field cleared successfully',
                timestamp: Date.now()
            };
            
        } catch (error) {
            return {
                success: false,
                message: `Clear field failed: ${error.message}`,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Wait for ready state
     */
    async waitForReadyState(timeout = 30000) {
        console.log('Waiting for ready state...');
        
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            const checkReady = () => {
                const elapsed = Date.now() - startTime;
                
                // Check if input field is ready and submit button is enabled
                const inputReady = this.state.inputField.ready;
                const submitEnabled = this.state.submitButton.enabled;
                const noErrors = !this.state.errors.active;
                
                if (inputReady && submitEnabled && noErrors) {
                    resolve({
                        success: true,
                        message: 'Ready state achieved',
                        elapsed: elapsed,
                        timestamp: Date.now()
                    });
                } else if (elapsed >= timeout) {
                    resolve({
                        success: false,
                        message: 'Ready state timeout',
                        elapsed: elapsed,
                        timestamp: Date.now()
                    });
                } else {
                    setTimeout(checkReady, 500);
                }
            };
            
            checkReady();
        });
    }
}

module.exports = ControlMethods;