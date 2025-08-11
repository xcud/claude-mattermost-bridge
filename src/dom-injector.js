/**
 * DOM Injection Module
 * Handles message injection and UI interaction with Claude Desktop
 */

const WebSocket = require('ws');

class DOMInjector {
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
            
            // Look for Claude chat interface
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
     * Execute JavaScript via WebSocket
     */
    async executeJavaScript(wsUrl, jsCode) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('WebSocket timeout'));
            }, 10000);
            
            ws.on('open', () => {
                // Enable Runtime domain
                ws.send(JSON.stringify({
                    id: 1,
                    method: 'Runtime.enable'
                }));
                
                // Execute the JavaScript
                ws.send(JSON.stringify({
                    id: 2,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: jsCode,
                        awaitPromise: true
                    }
                }));
            });
            
            ws.on('message', (data) => {
                const message = JSON.parse(data);
                
                if (message.id === 2) {
                    clearTimeout(timeout);
                    ws.close();
                    
                    if (message.result && message.result.result) {
                        resolve(message.result.result.value);
                    } else if (message.result && message.result.exceptionDetails) {
                        reject(new Error(message.result.exceptionDetails.text || 'JavaScript execution failed'));
                    } else {
                        resolve(true);
                    }
                }
            });
            
            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }    /**
     * Generate JavaScript code for message injection with anchor embedding
     */
    generateInjectionCode(message, anchorId = null) {
        // Escape message for JavaScript string
        const escapedMessage = message.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        
        // FIXED: Include anchor in the message content for targeting
        // If the message already contains an anchor pattern, don't add another one
        let finalMessage = escapedMessage;
        if (anchorId && !escapedMessage.includes('| ANCHOR:')) {
            // Extract just the user message part if it's a bridge message
            if (escapedMessage.includes('] ')) {
                const parts = escapedMessage.split('] ');
                const bridgeHeader = parts[0] + ']';
                const userMessage = parts.slice(1).join('] ');
                finalMessage = `${bridgeHeader.replace(']', ` | ANCHOR: ${anchorId}]`)} ${userMessage}`;
            } else {
                // Regular message - add anchor prefix
                finalMessage = `[ANCHOR: ${anchorId}] ${escapedMessage}`;
            }
        }
        
        return `
        (async function() {
            // Find the text input element (try multiple selectors)
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
                if (inputElement) {
                    console.log('Found input element with selector:', selector);
                    break;
                }
            }
            
            if (!inputElement) {
                throw new Error('Could not find text input element');
            }
            
            // NOTE: We deliberately do NOT focus() to avoid window activation
            // DOM injection via WebSocket doesn't require focus
            
            // Clear existing content and inject message
            if (inputElement.tagName.toLowerCase() === 'textarea') {
                inputElement.value = '';
                inputElement.value = '${finalMessage}';
                
                // Trigger input events
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // For contenteditable divs
                inputElement.textContent = '';
                inputElement.textContent = '${finalMessage}';
                
                // Trigger input events
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            // Wait a moment for the UI to update
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Find and click the send button
            const sendSelectors = [
                'button[data-testid*="send"]',
                'button[aria-label*="Send"]',
                'button[title*="Send"]',
                'button:has(svg[data-testid*="send"])',
                'button:has([data-icon="send"])',
                'button.send',
                'button[type="submit"]',
                'button:last-of-type'
            ];
            
            let sendButton = null;
            for (const selector of sendSelectors) {
                try {
                    sendButton = document.querySelector(selector);
                    if (sendButton && !sendButton.disabled) {
                        console.log('Found send button with selector:', selector);
                        break;
                    }
                } catch (e) {
                    // Some selectors might fail, continue
                }
            }
            
            if (sendButton) {
                sendButton.click();
                console.log('Send button clicked successfully');
                
                // CRITICAL FIX: Clear the input field after sending to prevent duplication
                await new Promise(resolve => setTimeout(resolve, 100));
                if (inputElement.tagName.toLowerCase() === 'textarea') {
                    inputElement.value = '';
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    inputElement.textContent = '';
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                return { success: true, method: 'button_click' };
            } else {
                // Try Enter key as fallback
                console.log('No send button found, trying Enter key');
                inputElement.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true
                }));
                
                return { success: true, method: 'enter_key' };
            }
        })();
        `;
    }    /**
     * Inject message into Claude Desktop with unique anchor
     */
    async injectMessage(message, providedAnchor = null) {
        // Generate unique anchor if none provided
        const anchor = providedAnchor || this.generateUniqueAnchor();
        
        this.log(`Injecting message with anchor: ${anchor}`);
        this.log(`Message preview: ${message.substring(0, 100)}...`);
        
        // Get available pages
        const pages = await this.getPages();
        if (!pages) {
            throw new Error('Could not connect to Chrome Debug Protocol');
        }
        
        // Find Claude page
        const claudePage = this.findClaudePage(pages);
        if (!claudePage) {
            throw new Error('Could not find Claude page');
        }
        
        this.log(`Found Claude page: ${claudePage.title}`);
        
        // Generate and execute injection code with anchor
        const injectionCode = this.generateInjectionCode(message, anchor);
        const result = await this.executeJavaScript(claudePage.webSocketDebuggerUrl, injectionCode);
        
        return {
            success: true,
            method: result?.method || 'unknown',
            anchor: anchor,
            timestamp: Date.now(),
            page: claudePage.title
        };
    }
    
    /**
     * Generate unique anchor for response tracking (NEW APPROACH)
     * Returns actual unique ID instead of content-based hash
     */
    generateUniqueAnchor() {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        return `msg_${timestamp}_${randomId}`;
    }

    /**
     * Legacy method - deprecated but kept for backward compatibility
     */
    generateAnchorHash(message) {
        console.warn('[DEPRECATED] generateAnchorHash is deprecated, use generateUniqueAnchor() instead');
        return this.generateUniqueAnchor();
    }
    
    /**
     * Create new chat context
     */
    async createNewChat() {
        this.log('Creating new chat context...');
        
        const pages = await this.getPages();
        if (!pages) {
            throw new Error('Could not connect to Chrome Debug Protocol');
        }
        
        const claudePage = this.findClaudePage(pages);
        if (!claudePage) {
            throw new Error('Could not find Claude page');
        }
        
        // JavaScript to create new chat
        const newChatCode = `
        (async function() {
            // Look for new chat button/link
            const newChatSelectors = [
                'a[href*="/new"]',
                'button[data-testid*="new"]',
                'button[aria-label*="new"]',
                'button[title*="New"]',
                '[data-testid="new-chat"]',
                'a[href="/new"]'
            ];
            
            let newChatButton = null;
            for (const selector of newChatSelectors) {
                newChatButton = document.querySelector(selector);
                if (newChatButton) {
                    console.log('Found new chat button with selector:', selector);
                    break;
                }
            }
            
            if (newChatButton) {
                newChatButton.click();
                return { success: true, method: 'new_chat_button' };
            } else {
                // Try navigating to /new
                window.location.href = '/new';
                return { success: true, method: 'navigation' };
            }
        })();
        `;
        
        const result = await this.executeJavaScript(claudePage.webSocketDebuggerUrl, newChatCode);
        
        return {
            success: true,
            chatId: `chat_${Date.now()}`,
            method: result?.method || 'unknown',
            timestamp: Date.now()
        };
    }
}

module.exports = DOMInjector;