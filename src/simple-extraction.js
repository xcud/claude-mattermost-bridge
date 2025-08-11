/**
 * Simple extraction function using the exact same logic as the working original
 * This replicates the proven working extraction queries
 */
const WebSocket = require('ws');

async function extractContentSimple(chromeDebugPort = 9223) {
    try {
        // Get pages - exact same logic as original
        const response = await fetch(`http://localhost:${chromeDebugPort}/json`);
        const pages = await response.json();
        
        // Find Claude page - exact same logic
        let claudePage = null;
        for (const page of pages) {
            const url = page.url || '';
            const title = page.title || '';
            
            if (url.includes('claude.ai') && !url.includes('login')) {
                claudePage = page;
                break;
            }
            if (title.includes('Claude') && page.type === 'page') {
                claudePage = page;
                break;
            }
        }
        
        if (!claudePage && pages.length > 0) {
            claudePage = pages[0];
        }
        
        if (!claudePage) {
            return {
                success: false,
                error: 'No Claude page found',
                content: '',
                contentLength: 0
            };
        }
        
        console.log(`[${new Date().toLocaleTimeString()}] Connected to Claude page: ${claudePage.title}`);
        const wsUrl = claudePage.webSocketDebuggerUrl;
        
        // Execute JavaScript - exact same as original
        const executeJavaScript = (jsCode) => {
            return new Promise((resolve, reject) => {
                const ws = new WebSocket(wsUrl);
                
                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('WebSocket timeout'));
                }, 10000);
                
                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        id: 1,
                        method: 'Runtime.evaluate',
                        params: { expression: jsCode, returnByValue: true }
                    }));
                });
                
                ws.on('message', (data) => {
                    clearTimeout(timeout);
                    ws.close();
                    try {
                        const result = JSON.parse(data);
                        if (result.id === 1) {
                            resolve(result);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
                
                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        };

        // Helper function for DOM element state inspection
        const getDOMCompletionState = async () => {
            const domInspectionCode = `
                (() => {
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
                    
                    // Look for footer with "Claude can make mistakes" 
                    const allElements = Array.from(document.querySelectorAll('*'));
                    const footerElement = allElements.find(el => 
                        el.textContent.includes('Claude can make mistakes') &&
                        el.getBoundingClientRect().height > 0
                    );
                    
                    return {
                        isResponding: stopButton !== null,
                        stopButton: stopButton ? {
                            found: true,
                            visible: !stopButton.hidden && 
                                    getComputedStyle(stopButton).display !== 'none' &&
                                    getComputedStyle(stopButton).visibility !== 'hidden',
                            text: stopButton.getAttribute('aria-label') || stopButton.textContent.trim()
                        } : { found: false },
                        sendButton: sendButton ? {
                            found: true,
                            disabled: sendButton.disabled,
                            visible: !sendButton.hidden && 
                                    getComputedStyle(sendButton).display !== 'none' &&
                                    getComputedStyle(sendButton).visibility !== 'hidden',
                            ariaLabel: sendButton.getAttribute('aria-label') || '',
                            size: {
                                width: sendButton.getBoundingClientRect().width,
                                height: sendButton.getBoundingClientRect().height
                            }
                        } : { found: false },
                        footer: footerElement ? {
                            present: true,
                            visible: !footerElement.hidden && 
                                    getComputedStyle(footerElement).display !== 'none' &&
                                    getComputedStyle(footerElement).visibility !== 'hidden'
                        } : { present: false },
                        timestamp: Date.now()
                    };
                })()
            `;
            
            try {
                const result = await executeJavaScript(domInspectionCode);
                if (result.result && result.result.result && result.result.result.value) {
                    return result.result.result.value;
                }
            } catch (error) {
                console.log(`[${new Date().toLocaleTimeString()}] DOM inspection failed: ${error.message}`);
            }
            
            return null;
        };
        
        // Use schema-resilient text-based extraction
        console.log(`[${new Date().toLocaleTimeString()}] Extracting full page content...`);
        
        try {
            const result = await executeJavaScript("document.body.innerText");
            
            if (result.result && result.result.result && result.result.result.value) {
                const bodyText = result.result.result.value;
                console.log(`[${new Date().toLocaleTimeString()}] SUCCESS: Extracted ${bodyText.length} characters from page`);
                
                // Parse conversation content using text patterns and anchors
                const conversationContent = parseConversationFromText(bodyText);
                
                // Check if response is complete - FIXED: Use DOM inspection instead of text search
                const isComplete = await checkResponseCompletion(bodyText, conversationContent, getDOMCompletionState);
                
                return {
                    success: true,
                    content: conversationContent,
                    contentLength: conversationContent.length,
                    complete: isComplete,
                    timestamp: Date.now()
                };
            }
        } catch (error) {
            console.log(`[${new Date().toLocaleTimeString()}] Text extraction failed: ${error.message}`);
        }
        
        return {
            success: false,
            error: 'Text extraction failed',
            content: '',
            contentLength: 0
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message,
            content: '',
            contentLength: 0
        };
    }
}

/**
 * Parse conversation content from full page text using anchors and patterns
 */
function parseConversationFromText(bodyText) {
    const lines = bodyText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Look for bridge message patterns with optional anchors - updated to handle new format
    const bridgeMessagePattern = /^\[BRIDGE: #[\w-]+ \| User: [\w-]+ \| \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\s*\|\s*ANCHOR:\s*[\w_]+)?\]/;
    
    // Find all bridge messages in the conversation
    const bridgeMessages = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (bridgeMessagePattern.test(line)) {
            bridgeMessages.push({
                lineIndex: i,
                content: line,
                timestamp: extractTimestampFromBridge(line)
            });
        }
    }
    
    if (bridgeMessages.length === 0) {
        console.log(`[${new Date().toLocaleTimeString()}] No bridge messages found, extracting recent content`);
        return extractRecentConversationContent(lines);
    }
    
    // Find the most recent bridge message
    const latestBridge = bridgeMessages[bridgeMessages.length - 1];
    console.log(`[${new Date().toLocaleTimeString()}] Found ${bridgeMessages.length} bridge messages, using latest: ${latestBridge.content.substring(0, 100)}...`);
    
    // Extract Claude's response after the latest bridge message
    const responseContent = extractResponseAfterBridge(lines, latestBridge.lineIndex);
    
    return responseContent;
}

/**
 * Extract timestamp from bridge message for anchor identification
 */
function extractTimestampFromBridge(bridgeLine) {
    const match = bridgeLine.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    return match ? match[0] : null;
}

/**
 * Extract Claude's response content after a bridge message
 */
function extractResponseAfterBridge(lines, bridgeLineIndex) {
    const responseLines = [];
    let foundResponseStart = false;
    
    // Look for content after the bridge message - INCREASED LIMIT for longer responses
    for (let i = bridgeLineIndex + 1; i < lines.length && i < bridgeLineIndex + 1000; i++) {
        const line = lines[i];
        
        // Stop if we hit another bridge message (conversation boundary)
        // Use the same regex pattern to avoid false positives from quoted bridge messages
        const bridgeMessagePattern = /^\[BRIDGE: #[\w-]+ \| User: [\w-]+ \| \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\s*\|\s*ANCHOR:\s*[\w_]+)?\]/;
        if (bridgeMessagePattern.test(line)) {
            break;
        }
        
        // Stop if we hit the classic Claude footer (end of response indicator)
        if (line.includes('Claude can make mistakes')) {
            // Include the content we've collected so far and stop
            break;
        }
        
        // Skip obvious UI elements but be less aggressive about filtering
        if (isUIContent(line)) {
            continue;
        }
        
        // Collect any substantial content - let the user decide what's useful
        if (line.length > 3 && !isNavigationOrUI(line)) {
            foundResponseStart = true;
            responseLines.push(line);
        }
    }
    
    const response = responseLines.join('\n').trim();
    
    // Lower the minimum threshold and be less restrictive
    if (response.length > 20) {
        console.log(`[${new Date().toLocaleTimeString()}] Extracted meaningful response: ${response.length} characters`);
        return response;
    } else {
        console.log(`[${new Date().toLocaleTimeString()}] Response too short or UI-like (${response.length} chars): "${response.substring(0, 100)}..."`);
        return '';
    }
}

/**
 * Check if response content looks like UI elements rather than actual Claude responses
 */
function isLikelyUIContent(content) {
    const uiIndicators = [
        /^Chat controls/,
        /^No content added yet/,
        /^New chat/,
        /^Chats$/,
        /^Loading/,
        /^Connecting/,
        /^Error:/,
        /^\d+\s*$/,
        /^[A-Z\s]{5,}$/,  // All caps short phrases
    ];
    
    return uiIndicators.some(pattern => pattern.test(content.trim()));
}

/**
 * Check if line is UI/navigation content to skip
 */
function isUIContent(line) {
    const uiPatterns = [
        /^New chat$/,
        /^Chats$/,
        /^Projects$/,
        /^Artifacts$/,
        /^Recents$/,
        /^Claude can make mistakes/,
        /^Smart, efficient model/,
        /^Add images, PDFs/,
        /^\d+\.\s*$/,  // Just numbers
        /^[A-Z]{1,3}$/,  // Short caps (like UI labels)
        /^[\-=]+$/,  // Separator lines
    ];
    
    return uiPatterns.some(pattern => pattern.test(line));
}

/**
 * Check if line is navigation or UI element
 */
function isNavigationOrUI(line) {
    return isUIContent(line) || 
           line.includes('console.log') || 
           line.includes('function(') ||
           line.includes('Error:') ||
           line.startsWith('ben@oum:') ||
           line.startsWith('npm run') ||
           line.startsWith('[') && line.includes('PM]');
}

/**
 * Fallback: Extract recent substantial conversation content when no bridge messages found
 */
function extractRecentConversationContent(lines) {
    const substantialLines = lines.filter(line => 
        line.length > 20 && 
        !isNavigationOrUI(line) && 
        !isUIContent(line)
    );
    
    // Take the last substantial content as the most recent response
    const recentContent = substantialLines.slice(-10).join('\n').trim();
    console.log(`[${new Date().toLocaleTimeString()}] Using recent content fallback: ${recentContent.length} characters`);
    
    return recentContent;
}

/**
 * Check if Claude's response is actually complete
 * FIXED: Uses real DOM element state inspection instead of text-based detection
 */
async function checkResponseCompletion(bodyText, extractedContent, getDOMCompletionState) {
    // If no content extracted yet, definitely not complete
    if (!extractedContent || extractedContent.length < 20) {
        return false;
    }
    
    // Find the position of our current anchor in the body text
    const anchorPattern = /\[BRIDGE: #[\w-]+ \| User: [\w-]+ \| \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\s*\|\s*ANCHOR:\s*[\w_]+)?\]/g;
    let lastAnchorPosition = -1;
    let match;
    
    // Find the last (most recent) bridge message position
    while ((match = anchorPattern.exec(bodyText)) !== null) {
        lastAnchorPosition = match.index;
    }
    
    if (lastAnchorPosition === -1) {
        console.log(`[${new Date().toLocaleTimeString()}] ⚠️ WARNING: No anchor found in page content`);
        return false;
    }
    
    // Get real DOM element states instead of text-based detection
    const domState = await getDOMCompletionState();
    
    if (!domState) {
        console.log(`[${new Date().toLocaleTimeString()}] ⚠️ WARNING: DOM inspection failed, falling back to conservative wait`);
        return false;
    }
    
    // Basic content requirement (any meaningful content, not length-based)
    const hasAnyContent = extractedContent && extractedContent.trim().length > 10;
    
    // REAL DOM INSPECTION: Check if Claude is still responding
    const claudeStillResponding = domState.isResponding && domState.stopButton.visible;
    
    // COMPLETION CRITERIA: Claude stopped responding AND we have content
    const responseComplete = !claudeStillResponding && hasAnyContent;
    
    // Additional check: Send button should be available when response is complete
    const sendButtonAvailable = domState.sendButton.found && 
                                !domState.sendButton.disabled && 
                                domState.sendButton.visible;
    
    // COMPLETION: Claude not responding AND content present AND (send button available OR reasonable wait time)
    if (responseComplete) {
        console.log(`[${new Date().toLocaleTimeString()}] ✅ COMPLETE: Claude finished responding with content (${extractedContent.length} chars)`);
        if (domState.stopButton.found) {
            console.log(`[${new Date().toLocaleTimeString()}] Stop button: visible=${domState.stopButton.visible}, text="${domState.stopButton.text}"`);
        }
        if (domState.sendButton.found) {
            console.log(`[${new Date().toLocaleTimeString()}] Send button: disabled=${domState.sendButton.disabled}, visible=${domState.sendButton.visible}, size=${domState.sendButton.size.width}x${domState.sendButton.size.height}`);
        }
        return true;
    }
    
    // Log current state for debugging - with real DOM details
    if (claudeStillResponding) {
        console.log(`[${new Date().toLocaleTimeString()}] ⏳ WAITING: Claude still responding (Stop button visible: ${domState.stopButton.visible}) - ${extractedContent.length} chars`);
    } else if (!hasAnyContent) {
        console.log(`[${new Date().toLocaleTimeString()}] ⏳ WAITING: No stop button but no content yet`);
    } else {
        console.log(`[${new Date().toLocaleTimeString()}] ⏳ WAITING: No stop button, has content, checking send button availability`);
    }
    
    return false; // Conservative: Only complete when submit enabled AND any content present
}

module.exports = { extractContentSimple };
