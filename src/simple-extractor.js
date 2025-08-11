/**
 * Simple WebSocket Extractor
 * Uses the exact same queries as the original working version
 * For HTTP API server compatibility
 */

const WebSocket = require('ws');

class SimpleWebSocketExtractor {
    constructor(chromeDebugPort = 9223) {
        this.chromeDebugPort = chromeDebugPort;
    }
    
    log(message) {
        console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
    }
    
    async getPages() {
        try {
            const response = await fetch(`http://localhost:${this.chromeDebugPort}/json`);
            return await response.json();
        } catch (error) {
            this.log(`Error getting pages: ${error.message}`);
            return null;
        }
    }
    
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
    
    async executeJavaScript(wsUrl, jsCode) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('WebSocket timeout'));
            }, 10000);
            
            ws.on('open', () => {
                ws.send(JSON.stringify({
                    id: Date.now(),
                    method: 'Runtime.evaluate',
                    params: { expression: jsCode, returnByValue: true }
                }));
            });
            
            ws.on('message', (data) => {
                clearTimeout(timeout);
                ws.close();
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
            
            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
    
    async extractContent() {
        try {
            const pages = await this.getPages();
            const claudePage = this.findClaudePage(pages);
            
            if (!claudePage) {
                return {
                    success: false,
                    error: 'No Claude page found',
                    content: '',
                    contentLength: 0
                };
            }
            
            this.log(`Connected to Claude page: ${claudePage.title}`);
            const wsUrl = claudePage.webSocketDebuggerUrl;
            
            // Use the exact same queries as the original working version
            const queries = [
                "document.body.innerText",
                "Array.from(document.querySelectorAll('[data-testid*=\"message\"]')).map(el => el.innerText).join('\\n\\n')",
                "Array.from(document.querySelectorAll('.message, .conversation-turn, .chat-message')).map(el => el.innerText).join('\\n\\n')",
                "Array.from(document.querySelectorAll('div[role=\"main\"] *')).filter(el => el.innerText && el.innerText.length > 50).map(el => el.innerText).slice(0, 5).join('\\n\\n')"
            ];
            
            for (let i = 0; i < queries.length; i++) {
                try {
                    this.log(`Trying query ${i + 1}, attempt 1...`);
                    const result = await this.executeJavaScript(wsUrl, queries[i]);
                    
                    if (result.result && result.result.result && result.result.result.value) {
                        const content = result.result.result.value;
                        if (content && content.length > 10) {
                            this.log(`SUCCESS: Extracted ${content.length} characters`);
                            return {
                                success: true,
                                content: content,
                                contentLength: content.length,
                                complete: true,
                                timestamp: Date.now()
                            };
                        }
                    }
                } catch (error) {
                    this.log(`Query ${i + 1} failed: ${error.message}`);
                }
            }
            
            return {
                success: false,
                error: 'All extraction queries failed',
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
}

module.exports = SimpleWebSocketExtractor;
