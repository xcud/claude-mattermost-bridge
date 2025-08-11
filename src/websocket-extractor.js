/**
 * WebSocket Extractor Module
 * Handles content extraction from Claude Desktop using WebSocket API
 */

const WebSocket = require('ws');

class WebSocketExtractor {
    constructor(chromeDebugPort = 9223) {
        this.debugPort = chromeDebugPort;
        this.logPrefix = `[${new Date().toLocaleTimeString()}]`;
        this.activeStreams = new Map(); // anchor -> stream info
        this.injectionTimestamps = new Map(); // anchor -> injection timestamp
        this.lastContentHashes = new Map(); // anchor -> content hash for change detection
    }
    
    log(message) {
        console.log(`${this.logPrefix} ${message}`);
    }

    /**
     * Track when a message was injected (call this after injection)
     */
    trackInjection(anchorHash) {
        const timestamp = Date.now();
        this.injectionTimestamps.set(anchorHash, timestamp);
        this.lastContentHashes.set(anchorHash, '');
        this.log(`Tracking injection for anchor: ${anchorHash} at ${timestamp}`);
        return timestamp;
    }

    /**
     * Check if content appears to be NEW (after injection)
     */
    isContentNew(anchorHash, content) {
        const injectionTime = this.injectionTimestamps.get(anchorHash);
        if (!injectionTime) {
            this.log(`No injection timestamp for anchor: ${anchorHash}`);
            return false;
        }

        // Simple content hash to detect changes
        const contentHash = this.hashContent(content);
        const lastHash = this.lastContentHashes.get(anchorHash);
        
        if (contentHash === lastHash) {
            return false; // No content change
        }

        this.lastContentHashes.set(anchorHash, contentHash);
        return true;
    }

    /**
     * Simple content hashing for change detection
     */
    hashContent(content) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
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
            
            // Look for Claude chat interface (not login page)
            if (url.includes('claude.ai') && !url.includes('login')) {
                return page;
            }
            if (title.includes('Claude') && page.type === 'page') {
                return page;
            }
        }
        
        // Fallback to first page
        return pages.length > 0 ? pages[0] : null;
    }
    
    /**
     * Execute JavaScript via WebSocket with timeout and error handling
     */
    async executeJavaScript(wsUrl, jsCode, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            
            const timeoutHandle = setTimeout(() => {
                ws.close();
                reject(new Error('WebSocket timeout'));
            }, timeout);
            
            ws.on('open', () => {
                // Send Runtime.evaluate command
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
                        resolve(response);
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
            
            ws.on('close', () => {
                clearTimeout(timeoutHandle);
            });
        });
    }    /**
     * Generate extraction queries using FIXED anchor approach
     */
    generateExtractionQueries(anchorHash = null) {
        // If we have an anchor hash, use proper message sequencing
        if (anchorHash) {
            const anchorQueries = [
                // FIXED APPROACH: Find anchored message, then get Claude's response after it
                `(function() {
                    const anchorId = '${anchorHash}';
                    
                    // Extract timestamp from anchor (msg_TIMESTAMP_RANDOMID)
                    const match = anchorId.match(/msg_(\\d+)_/);
                    if (!match) {
                        return {
                            content: '',
                            anchor: anchorId,
                            debug: 'Invalid anchor format',
                            timestamp: Date.now()
                        };
                    }
                    
                    const anchorTimestamp = parseInt(match[1]);
                    
                    // Get all potential message containers (UPDATED: Better selectors first)
                    const messageSelectors = [
                        'div[class*="message"]',
                        '[data-testid*="message"]',
                        '.message',
                        '.conversation-turn', 
                        '.chat-message',
                        '[role="article"]',
                        '[data-testid*="conversation"]',
                        '[data-testid*="human-turn"]',
                        '[data-testid*="assistant-turn"]'
                    ];
                    
                    let allMessages = [];
                    for (const selector of messageSelectors) {
                        const elements = Array.from(document.querySelectorAll(selector));
                        if (elements.length > 0) {
                            allMessages = elements;
                            break;
                        }
                    }
                    
                    if (allMessages.length === 0) {
                        return {
                            content: '',
                            anchor: anchorId,
                            debug: 'No messages found on page',
                            timestamp: Date.now()
                        };
                    }
                    
                    // STEP 1: Find the user message containing our anchor
                    let anchoredMessageIndex = -1;
                    for (let i = 0; i < allMessages.length; i++) {
                        const messageText = allMessages[i].innerText || allMessages[i].textContent || '';
                        if (messageText.includes('ANCHOR: ' + anchorId)) {
                            anchoredMessageIndex = i;
                            break;
                        }
                    }
                    
                    if (anchoredMessageIndex === -1) {
                        return {
                            content: '',
                            anchor: anchorId,
                            debug: 'Could not find message containing anchor: ' + anchorId,
                            totalMessages: allMessages.length,
                            timestamp: Date.now()
                        };
                    }
                    
                    // STEP 2: Look for Claude's response AFTER the anchored message
                    for (let i = anchoredMessageIndex + 1; i < allMessages.length; i++) {
                        const responseMessage = allMessages[i];
                        const responseText = responseMessage.innerText || responseMessage.textContent || '';
                        
                        // Skip empty or very short messages
                        if (responseText.length < 10) {
                            continue;
                        }
                        
                        // Skip messages that contain our anchor (those are user messages)
                        if (responseText.includes('ANCHOR: ' + anchorId) || responseText.includes('[BRIDGE:')) {
                            continue;
                        }
                        
                        // This should be Claude's response
                        return {
                            content: responseText,
                            anchor: anchorId,
                            messageCount: allMessages.length,
                            anchoredMessageIndex: anchoredMessageIndex,
                            responseMessageIndex: i,
                            debug: 'Successfully found Claude response after anchored message',
                            extractionMethod: 'sequential_after_anchor',
                            timestamp: Date.now()
                        };
                    }
                    
                    // No response found after anchored message
                    return {
                        content: '',
                        anchor: anchorId,
                        debug: 'Found anchored message but no Claude response after it',
                        anchoredMessageIndex: anchoredMessageIndex,
                        totalMessages: allMessages.length,
                        timestamp: Date.now()
                    };
                })()`,
                
                
                // Fallback: Alternative message structure detection
                `(function() {
                    const anchorId = '${anchorHash}';
                    
                    // Try alternative approach: look for conversation containers
                    const conversationContainer = document.querySelector('[data-testid*="conversation"], .conversation, .chat-messages, .messages');
                    if (!conversationContainer) {
                        return {
                            content: '',
                            anchor: anchorId,
                            debug: 'No conversation container found',
                            timestamp: Date.now()
                        };
                    }
                    
                    // Get all direct children of conversation container
                    const conversationTurns = Array.from(conversationContainer.children);
                    
                    // Find anchored message
                    let anchoredTurnIndex = -1;
                    for (let i = 0; i < conversationTurns.length; i++) {
                        const turnText = conversationTurns[i].innerText || conversationTurns[i].textContent || '';
                        if (turnText.includes('ANCHOR: ' + anchorId)) {
                            anchoredTurnIndex = i;
                            break;
                        }
                    }
                    
                    if (anchoredTurnIndex === -1 || anchoredTurnIndex >= conversationTurns.length - 1) {
                        return {
                            content: '',
                            anchor: anchorId,
                            debug: 'Anchored turn not found or no turn after it',
                            conversationTurns: conversationTurns.length,
                            timestamp: Date.now()
                        };
                    }
                    
                    // Get next turn (should be Claude's response)
                    const claudeResponseTurn = conversationTurns[anchoredTurnIndex + 1];
                    const responseText = claudeResponseTurn.innerText || claudeResponseTurn.textContent || '';
                    
                    if (responseText.length > 5 && !responseText.includes('ANCHOR: ') && !responseText.includes('[BRIDGE:')) {
                        return {
                            content: responseText,
                            anchor: anchorId,
                            debug: 'Found Claude response via conversation turns',
                            extractionMethod: 'conversation_turns',
                            anchoredTurnIndex: anchoredTurnIndex,
                            timestamp: Date.now()
                        };
                    }
                    
                    return {
                        content: '',
                        anchor: anchorId,
                        debug: 'Next turn after anchor appears to be user message or empty',
                        responseTextPreview: responseText.substring(0, 100),
                        timestamp: Date.now()
                    };
                })()`
            ];
            
            return anchorQueries;
        }
        
        // Fallback queries for cases without anchor (backward compatibility)
        const fallbackQueries = [
            // Try to get the latest message/response
            `(function() {
                const messages = Array.from(document.querySelectorAll('[data-testid*="message"], .message, .conversation-turn, .chat-message'));
                if (messages.length === 0) return null;
                
                const lastMessage = messages[messages.length - 1];
                return {
                    content: lastMessage.innerText || lastMessage.textContent,
                    timestamp: Date.now(),
                    element: lastMessage.tagName,
                    debug: 'Fallback: latest message extraction'
                };
            })()`,
            
            // Fallback to body text
            `(function() {
                const bodyText = document.body.innerText;
                if (bodyText && bodyText.length > 50) {
                    return {
                        content: bodyText,
                        source: 'body',
                        debug: 'Fallback: full body text',
                        timestamp: Date.now()
                    };
                }
                return null;
            })()`
        ];
        
        return fallbackQueries;
    }
    
    /**
     * Extract timestamp from anchor hash (works with both old and new formats)
     */
    extractTimestampFromAnchor(anchorHash) {
        // New format: msg_TIMESTAMP_RANDOMID
        // Old format: msg_TIMESTAMP_MESSAGECONTENT
        const match = anchorHash.match(/msg_(\d+)_/);
        return match ? parseInt(match[1]) : Date.now();
    }    /**
     * Extract content from Claude Desktop
     */
    async extractContent(anchorHash = null, options = {}) {
        const { timeout = 10000, retries = 3 } = options;
        
        this.log(`Extracting content${anchorHash ? ` for anchor: ${anchorHash}` : ''}...`);
        
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
        
        this.log(`Connected to Claude page: ${claudePage.title}`);
        
        // Generate extraction queries
        const queries = this.generateExtractionQueries(anchorHash);
        
        // Try each query with retries
        for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
            const query = queries[queryIndex];
            
            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    this.log(`Trying query ${queryIndex + 1}, attempt ${attempt + 1}...`);
                    
                    const result = await this.executeJavaScript(
                        claudePage.webSocketDebuggerUrl, 
                        query, 
                        timeout
                    );
                    
                    if (result.result && result.result.result && result.result.result.value) {
                        const extractedData = result.result.result.value;
                        
                        if (extractedData && extractedData.content && extractedData.content.length > 10) {
                            this.log(`SUCCESS: Extracted ${extractedData.content.length} characters`);
                            
                            return {
                                success: true,
                                content: extractedData.content,
                                complete: extractedData.complete !== false, // Default to true unless explicitly false
                                anchor: anchorHash,
                                metadata: {
                                    queryIndex: queryIndex,
                                    attempt: attempt + 1,
                                    messageCount: extractedData.messageCount,
                                    selector: extractedData.selector,
                                    source: extractedData.source,
                                    element: extractedData.element
                                },
                                timestamp: Date.now()
                            };
                        }
                    }
                } catch (error) {
                    this.log(`Query ${queryIndex + 1}, attempt ${attempt + 1} failed: ${error.message}`);
                }
            }
        }
        
        // All queries failed
        return {
            success: false,
            content: '',
            complete: false,
            anchor: anchorHash,
            message: 'All extraction queries failed',
            timestamp: Date.now()
        };
    }
    
    /**
     * Monitor for response with specific anchor hash
     */
    async monitorForResponse(anchorHash, timeout = 60000, streamCallback = null) {
        this.log(`Starting streaming monitor for anchor: ${anchorHash}`);
        
        const startTime = Date.now();
        const checkInterval = 1000; // Check every 1 second for streaming
        let lastContent = '';
        let responseStarted = false;
        let responseComplete = false;
        
        return new Promise((resolve) => {
            const streamMonitor = async () => {
                const elapsed = Date.now() - startTime;
                
                if (elapsed >= timeout) {
                    this.log(`Response monitoring timeout for ${anchorHash}`);
                    resolve({
                        success: false,
                        content: lastContent,
                        complete: false,
                        anchor: anchorHash,
                        message: 'Response monitoring timeout',
                        elapsed: elapsed,
                        timestamp: Date.now()
                    });
                    return;
                }

                try {
                    // First, wait for Claude to start responding
                    if (!responseStarted) {
                        const isResponding = await this.detectResponseStart(anchorHash);
                        if (!isResponding) {
                            // Continue waiting for response to start
                            setTimeout(streamMonitor, checkInterval);
                            return;
                        }
                        responseStarted = true;
                        this.log(`Response started for anchor: ${anchorHash}`);
                    }

                    // Extract current content
                    const result = await this.extractContent(anchorHash, { timeout: 3000, retries: 1 });
                    
                    if (result.success && result.content) {
                        // Check if this is NEW content since last check
                        if (this.isContentNew(anchorHash, result.content) && result.content.length > lastContent.length) {
                            lastContent = result.content;
                            this.log(`New content detected: ${lastContent.length} chars`);
                            
                            // Stream update via callback if provided
                            if (streamCallback) {
                                streamCallback({
                                    success: true,
                                    content: lastContent,
                                    complete: false,
                                    anchor: anchorHash,
                                    timestamp: Date.now()
                                });
                            }
                        }
                    }

                    // Check if response is complete
                    if (responseStarted) {
                        responseComplete = await this.detectResponseCompletion(anchorHash);
                        if (responseComplete) {
                            this.log(`Response complete for anchor: ${anchorHash}`);
                            
                            // Final content extraction
                            const finalResult = await this.extractContent(anchorHash, { timeout: 3000, retries: 2 });
                            if (finalResult.success && finalResult.content.length > lastContent.length) {
                                lastContent = finalResult.content;
                            }

                            // Final stream update
                            if (streamCallback) {
                                streamCallback({
                                    success: true,
                                    content: lastContent,
                                    complete: true,
                                    anchor: anchorHash,
                                    timestamp: Date.now()
                                });
                            }

                            resolve({
                                success: true,
                                content: lastContent,
                                complete: true,
                                anchor: anchorHash,
                                elapsed: elapsed,
                                timestamp: Date.now()
                            });
                            return;
                        }
                    }

                } catch (error) {
                    this.log(`Monitor check failed: ${error.message}`);
                }
                
                // Continue monitoring
                setTimeout(streamMonitor, checkInterval);
            };

            streamMonitor();
        });
    }    /**
     * Detect response completion with multiple markers
     */
    async detectResponseCompletion(anchorHash) {
        try {
            const pages = await this.getPages();
            const claudePage = this.findClaudePage(pages);
            
            if (!claudePage) {
                return false;
            }
            
            // Use the PROVEN completion detection logic from simple-extraction.js
            const completionCheck = `
            (function() {
                // KEY INSIGHT: When Claude is responding, there's a "Stop response" button
                // When Claude finishes, this disappears and send button appears
                
                // Look for "Stop response" button (indicates Claude is still responding)
                const stopButton = document.querySelector('[aria-label*="Stop"]');
                
                // Look for text input area
                const textInput = document.querySelector('div[contenteditable="true"]');
                
                // Look for buttons near text input that could be send buttons
                let sendButton = null;
                if (textInput) {
                    const inputRect = textInput.getBoundingClientRect();
                    const allButtons = Array.from(document.querySelectorAll('button'));
                    
                    // Find buttons near the text input area
                    const nearbyButtons = allButtons.filter(btn => {
                        const btnRect = btn.getBoundingClientRect();
                        const verticalDistance = Math.abs(btnRect.top - inputRect.top);
                        const horizontalDistance = Math.abs(btnRect.left - inputRect.right);
                        
                        // Look for small icon buttons (typically 30-40px) near text input
                        return verticalDistance < 50 && horizontalDistance < 200 && 
                               btnRect.width > 20 && btnRect.width < 50 &&
                               btnRect.height > 20 && btnRect.height < 50;
                    });
                    
                    // The send button should be the rightmost button near text input
                    // and should NOT be the stop button
                    sendButton = nearbyButtons
                        .filter(btn => !btn.getAttribute('aria-label')?.includes('Stop'))
                        .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
                }
                
                // REAL DOM INSPECTION: Check if Claude is still responding
                const claudeStillResponding = stopButton !== null && 
                                            !stopButton.hidden && 
                                            getComputedStyle(stopButton).display !== 'none' &&
                                            getComputedStyle(stopButton).visibility !== 'hidden';
                
                // COMPLETION CRITERIA: Claude stopped responding (no visible stop button)
                const responseComplete = !claudeStillResponding;
                
                return {
                    complete: responseComplete,
                    indicator: responseComplete ? 'stop_button_disappeared' : 'still_responding',
                    stopButtonFound: stopButton !== null,
                    stopButtonVisible: claudeStillResponding,
                    sendButtonFound: sendButton !== null,
                    sendButtonDisabled: sendButton ? sendButton.disabled : null
                };
            })();
            `;
            
            const result = await this.executeJavaScript(claudePage.webSocketDebuggerUrl, completionCheck);
            
            if (result.result && result.result.result && result.result.result.value) {
                const completionData = result.result.result.value;
                this.log(`Completion check: ${JSON.stringify(completionData)}`);
                return completionData.complete === true;
            }
            
            return false;
            
        } catch (error) {
            this.log(`Completion detection failed: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Stream content updates in real-time (placeholder for future implementation)
     */
    async streamContentUpdates(anchorHash) {
        // This would be implemented with WebSocket streaming in the future
        // For now, return null to indicate not implemented
        this.log(`Real-time streaming not yet implemented for anchor: ${anchorHash}`);
        return null;
    }
    
    /**
     * Clean up any active streams
     */
    cleanup() {
        this.log('Cleaning up WebSocket extractor...');
        // Close any active streams
        for (const [anchor, streamInfo] of this.activeStreams) {
            if (streamInfo.ws && streamInfo.ws.readyState === WebSocket.OPEN) {
                streamInfo.ws.close();
            }
        }
        this.activeStreams.clear();
    }

    /**
     * Detect when Claude starts responding (typing indicators, submit button changes)
     */
    async detectResponseStart(anchorHash) {
        try {
            const pages = await this.getPages();
            const claudePage = this.findClaudePage(pages);
            
            if (!claudePage) {
                return false;
            }

            // Connect to page via WebSocket
            const ws = new WebSocket(claudePage.webSocketDebuggerUrl);
            
            return new Promise((resolve) => {
                let resolved = false;
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        ws.close();
                        resolve(false);
                    }
                }, 5000);

                ws.on('open', () => {
                    // Enable runtime and DOM events
                    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
                    ws.send(JSON.stringify({ id: 2, method: 'DOM.enable' }));
                    
                    // JavaScript to detect response indicators
                    const responseStartCheck = `
                    (function() {
                        // Check if submit button is disabled (indicates processing)
                        const submitButton = document.querySelector('button[data-testid*="send"], button[aria-label*="Send"], button[type="submit"]');
                        if (submitButton && submitButton.disabled) {
                            return { responding: true, indicator: 'submit_disabled' };
                        }
                        
                        // Check for typing/loading indicators
                        const loadingIndicators = document.querySelectorAll('[data-testid*="loading"], .loading, .thinking, .spinner, [data-testid*="typing"]');
                        if (loadingIndicators.length > 0) {
                            return { responding: true, indicator: 'loading_indicators' };
                        }
                        
                        // Check if input field is disabled
                        const inputField = document.querySelector('textarea[placeholder*="message"], div[contenteditable="true"]');
                        if (inputField && (inputField.disabled || inputField.readOnly)) {
                            return { responding: true, indicator: 'input_disabled' };
                        }
                        
                        // Check for any visual changes since injection
                        const injectionTime = ${this.injectionTimestamps.get(anchorHash) || Date.now()};
                        const timeSinceInjection = Date.now() - injectionTime;
                        
                        // If enough time has passed and we see UI changes, assume responding
                        if (timeSinceInjection > 2000) {
                            return { responding: true, indicator: 'time_elapsed' };
                        }
                        
                        return { responding: false, indicator: 'none' };
                    })()`;
                    
                    ws.send(JSON.stringify({
                        id: 3,
                        method: 'Runtime.evaluate',
                        params: {
                            expression: responseStartCheck,
                            returnByValue: true
                        }
                    }));
                });

                ws.on('message', (data) => {
                    if (resolved) return;
                    
                    try {
                        const message = JSON.parse(data);
                        if (message.id === 3 && message.result && message.result.result) {
                            const result = message.result.result.value;
                            if (result && result.responding) {
                                this.log(`Response start detected: ${result.indicator}`);
                                resolved = true;
                                clearTimeout(timeout);
                                ws.close();
                                resolve(true);
                            } else {
                                // Not responding yet, resolve false
                                resolved = true;
                                clearTimeout(timeout);
                                ws.close();
                                resolve(false);
                            }
                        }
                    } catch (error) {
                        this.log(`Error parsing response start message: ${error.message}`);
                    }
                });

                ws.on('error', (error) => {
                    if (!resolved) {
                        this.log(`WebSocket error in response start detection: ${error.message}`);
                        resolved = true;
                        clearTimeout(timeout);
                        resolve(false);
                    }
                });
            });

        } catch (error) {
            this.log(`Error detecting response start: ${error.message}`);
            return false;
        }
    }
}

module.exports = WebSocketExtractor;
