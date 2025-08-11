/**
 * DOM Observability Module
 * Handles real-time UI element detection and state monitoring
 */

const WebSocket = require('ws');

class DOMObserver {
    constructor(chromeDebugPort = 9223) {
        this.debugPort = chromeDebugPort;
        this.logPrefix = `[${new Date().toLocaleTimeString()}]`;
    }
    
    log(message) {
        console.log(`${this.logPrefix} ${message}`);
    }
    
    /**
     * Get available Chrome debug pages
     */
    async getPages() {
        try {
            const response = await fetch(`http://localhost:${this.debugPort}/json`);
            return await response.json();
        } catch (error) {
            this.log(`Error getting pages: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Find Claude chat page
     */
    findClaudePage(pages) {
        if (!pages) return null;
        
        for (const page of pages) {
            const url = page.url || '';
            const title = page.title || '';
            
            if (url.includes('claude.ai') && !url.includes('login')) {
                return page;
            }
            if (title.includes('Claude') && page.type === 'page') {
                return page;
            }
        }
        
        return pages.length > 0 ? pages[0] : null;
    }
    
    /**
     * Execute JavaScript via WebSocket with error handling
     */
    async executeJavaScript(wsUrl, jsCode, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            
            const timeoutHandle = setTimeout(() => {
                ws.close();
                reject(new Error('WebSocket timeout'));
            }, timeout);
            
            ws.on('open', () => {
                const command = {
                    id: 1,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: jsCode,
                        returnByValue: true,
                        awaitPromise: false
                    }
                };
                
                ws.send(JSON.stringify(command));
            });
            
            ws.on('message', (data) => {
                clearTimeout(timeoutHandle);
                try {
                    const response = JSON.parse(data.toString());
                    if (response.id === 1) {
                        ws.close();
                        
                        if (response.result && response.result.result) {
                            resolve(response.result.result.value);
                        } else if (response.result && response.result.exceptionDetails) {
                            reject(new Error(response.result.exceptionDetails.text || 'JavaScript execution failed'));
                        } else {
                            resolve(null);
                        }
                    }
                } catch (error) {
                    ws.close();
                    reject(error);
                }
            });
            
            ws.on('error', (error) => {
                clearTimeout(timeoutHandle);
                reject(error);
            });
        });
    }    /**
     * Generate JavaScript code for submit button state detection
     */
    generateSubmitButtonQuery() {
        return `
        (function() {
            const selectors = [
                'button[data-testid*="send"]',
                'button[aria-label*="Send"]',
                'button[title*="Send"]',
                'button:has(svg[data-testid*="send"])',
                'button:has([data-icon="send"])',
                'button.send',
                'button[type="submit"]'
            ];
            
            let submitButton = null;
            let selectorUsed = null;
            
            for (const selector of selectors) {
                try {
                    submitButton = document.querySelector(selector);
                    if (submitButton) {
                        selectorUsed = selector;
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            if (submitButton) {
                return {
                    enabled: !submitButton.disabled,
                    visible: submitButton.offsetParent !== null,
                    selector: selectorUsed,
                    text: submitButton.textContent || submitButton.innerText || '',
                    className: submitButton.className,
                    timestamp: Date.now()
                };
            } else {
                return {
                    enabled: false,
                    visible: false,
                    selector: null,
                    text: '',
                    className: '',
                    timestamp: Date.now(),
                    error: 'Submit button not found'
                };
            }
        })();
        `;
    }
    
    /**
     * Generate JavaScript code for input field state detection
     */
    generateInputFieldQuery() {
        return `
        (function() {
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
            let selectorUsed = null;
            
            for (const selector of selectors) {
                try {
                    inputElement = document.querySelector(selector);
                    if (inputElement) {
                        selectorUsed = selector;
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            if (inputElement) {
                const isTextarea = inputElement.tagName.toLowerCase() === 'textarea';
                const content = isTextarea ? inputElement.value : inputElement.textContent || inputElement.innerText;
                
                return {
                    ready: !inputElement.disabled && !inputElement.readOnly,
                    content: content || '',
                    focused: document.activeElement === inputElement,
                    selector: selectorUsed,
                    type: inputElement.tagName.toLowerCase(),
                    placeholder: inputElement.placeholder || '',
                    contentLength: (content || '').length,
                    timestamp: Date.now()
                };
            } else {
                return {
                    ready: false,
                    content: '',
                    focused: false,
                    selector: null,
                    type: '',
                    placeholder: '',
                    contentLength: 0,
                    timestamp: Date.now(),
                    error: 'Input field not found'
                };
            }
        })();
        `;
    }    /**
     * Generate JavaScript code for processing state detection
     */
    generateProcessingStateQuery() {
        return `
        (function() {
            // Look for loading/thinking indicators
            const loadingSelectors = [
                '[data-testid*="loading"]',
                '.loading',
                '.thinking',
                '.spinner',
                '[aria-label*="loading"]',
                '[aria-label*="thinking"]',
                '.animate-spin',
                '.loading-dots'
            ];
            
            let hasLoadingIndicators = false;
            let loadingType = null;
            
            for (const selector of loadingSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        hasLoadingIndicators = true;
                        loadingType = selector;
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            // Check submit button state (disabled usually means processing)
            const submitButton = document.querySelector('button[data-testid*="send"], button[aria-label*="Send"]');
            const submitDisabled = submitButton ? submitButton.disabled : false;
            
            // Check for any "typing" or "generating" text
            const bodyText = document.body.innerText.toLowerCase();
            const hasTypingText = bodyText.includes('typing') || 
                                  bodyText.includes('thinking') || 
                                  bodyText.includes('generating') ||
                                  bodyText.includes('processing');
            
            // Determine processing state
            let active = false;
            let type = null;
            
            if (hasLoadingIndicators) {
                active = true;
                type = 'thinking';
            } else if (submitDisabled) {
                active = true;
                type = 'responding';
            } else if (hasTypingText) {
                active = true;
                type = 'generating';
            } else {
                active = false;
                type = 'complete';
            }
            
            return {
                active: active,
                type: type,
                hasLoadingIndicators: hasLoadingIndicators,
                loadingSelector: loadingType,
                submitDisabled: submitDisabled,
                hasTypingText: hasTypingText,
                timestamp: Date.now()
            };
        })();
        `;
    }
    
    /**
     * Generate JavaScript code for chat navigation state detection
     */
    generateChatNavigationQuery() {
        return `
        (function() {
            // Look for chat/conversation list elements
            const chatSelectors = [
                '[data-testid*="conversation"]',
                '[data-testid*="chat"]',
                '.conversation',
                '.chat',
                '.chat-item',
                'nav a[href*="/chat/"]',
                'nav a[href*="/conversation/"]'
            ];
            
            let chatElements = [];
            let activeChat = null;
            let selectorUsed = null;
            
            for (const selector of chatSelectors) {
                try {
                    const elements = Array.from(document.querySelectorAll(selector));
                    if (elements.length > 0) {
                        chatElements = elements;
                        selectorUsed = selector;
                        
                        // Try to find active/selected chat
                        const activeElement = elements.find(el => 
                            el.classList.contains('active') || 
                            el.classList.contains('selected') ||
                            el.getAttribute('aria-selected') === 'true'
                        );
                        
                        if (activeElement) {
                            activeChat = activeElement.href || activeElement.textContent || 'active';
                        }
                        
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            // Check for new chat button
            const newChatSelectors = [
                'a[href*="/new"]',
                'button[data-testid*="new"]',
                'button[aria-label*="new"]',
                'button[title*="New"]',
                '[data-testid="new-chat"]'
            ];
            
            let newChatButton = null;
            for (const selector of newChatSelectors) {
                try {
                    newChatButton = document.querySelector(selector);
                    if (newChatButton) break;
                } catch (e) {
                    // Continue
                }
            }
            
            return {
                ready: true, // Navigation is generally always ready
                chatCount: chatElements.length,
                activeChat: activeChat,
                hasNewChatButton: !!newChatButton,
                selector: selectorUsed,
                newChatAvailable: newChatButton ? !newChatButton.disabled : false,
                timestamp: Date.now()
            };
        })();
        `;
    }    /**
     * Observe submit button state
     */
    async observeSubmitButtonState() {
        try {
            const pages = await this.getPages();
            const claudePage = this.findClaudePage(pages);
            
            if (!claudePage) {
                throw new Error('Could not find Claude page');
            }
            
            const query = this.generateSubmitButtonQuery();
            const result = await this.executeJavaScript(claudePage.webSocketDebuggerUrl, query);
            
            return result || {
                enabled: false,
                visible: false,
                selector: null,
                error: 'No result from query',
                timestamp: Date.now()
            };
            
        } catch (error) {
            return {
                enabled: false,
                visible: false,
                selector: null,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Observe input field state
     */
    async observeInputFieldState() {
        try {
            const pages = await this.getPages();
            const claudePage = this.findClaudePage(pages);
            
            if (!claudePage) {
                throw new Error('Could not find Claude page');
            }
            
            const query = this.generateInputFieldQuery();
            const result = await this.executeJavaScript(claudePage.webSocketDebuggerUrl, query);
            
            return result || {
                ready: false,
                content: '',
                focused: false,
                error: 'No result from query',
                timestamp: Date.now()
            };
            
        } catch (error) {
            return {
                ready: false,
                content: '',
                focused: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Observe processing state
     */
    async observeProcessingState() {
        try {
            const pages = await this.getPages();
            const claudePage = this.findClaudePage(pages);
            
            if (!claudePage) {
                throw new Error('Could not find Claude page');
            }
            
            const query = this.generateProcessingStateQuery();
            const result = await this.executeJavaScript(claudePage.webSocketDebuggerUrl, query);
            
            return result || {
                active: false,
                type: 'unknown',
                error: 'No result from query',
                timestamp: Date.now()
            };
            
        } catch (error) {
            return {
                active: false,
                type: 'error',
                error: error.message,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Observe chat navigation state
     */
    async observeChatNavigationState() {
        try {
            const pages = await this.getPages();
            const claudePage = this.findClaudePage(pages);
            
            if (!claudePage) {
                throw new Error('Could not find Claude page');
            }
            
            const query = this.generateChatNavigationQuery();
            const result = await this.executeJavaScript(claudePage.webSocketDebuggerUrl, query);
            
            return result || {
                ready: false,
                chatCount: 0,
                activeChat: null,
                error: 'No result from query',
                timestamp: Date.now()
            };
            
        } catch (error) {
            return {
                ready: false,
                chatCount: 0,
                activeChat: null,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }
}

module.exports = DOMObserver;