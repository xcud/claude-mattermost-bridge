/**
 * Extraction Methods Module
 * Handles all content extraction operations for Claude Desktop Interface
 */

const WebSocketExtractor = require('./websocket-extractor');

class ExtractionMethods {
    constructor(desktopState, connectionManager) {
        this.state = desktopState;
        this.connections = connectionManager;
        this.webSocketExtractor = new WebSocketExtractor(connectionManager.config.chromeDebugPort);
    }
    
    /**
     * Extract content from Claude Desktop
     * Enhanced with real-time streaming capabilities
     */
    async extractContent(options = {}) {
        const { anchor = null, format = 'raw', streaming = false, timeout = 10000 } = options;
        
        console.log('Extracting content...');
        
        try {
            // Update processing state
            this.state.updateState('processing', {
                active: true,
                type: 'extracting',
                startTime: Date.now(),
                anchor: anchor
            });
            
            // Perform WebSocket extraction
            const result = await this.webSocketExtractor.extractContent(anchor, { timeout });
            
            if (result.success) {
                // Update processing state with success
                this.state.updateState('processing', {
                    active: false,
                    type: 'complete',
                    progress: 100
                });
                
                // Format content if requested
                let formattedContent = result.content;
                if (format === 'markdown') {
                    formattedContent = this.formatAsMarkdown(result.content);
                } else if (format === 'plain') {
                    formattedContent = this.formatAsPlainText(result.content);
                }
                
                return {
                    success: true,
                    content: formattedContent,
                    complete: result.complete,
                    anchor: anchor,
                    metadata: result.metadata,
                    message: `Extracted ${result.content.length} characters`,
                    timestamp: result.timestamp
                };
            } else {
                // Update error state
                this.state.updateState('errors', {
                    active: true,
                    type: 'extraction',
                    message: result.message || 'Content extraction failed',
                    recoverable: true,
                    timestamp: Date.now()
                });
                
                this.state.updateState('processing', {
                    active: false,
                    type: null
                });
                
                return {
                    success: false,
                    content: '',
                    complete: false,
                    anchor: anchor,
                    message: result.message || 'Content extraction failed',
                    timestamp: Date.now()
                };
            }
            
        } catch (error) {
            // Update error state
            this.state.updateState('errors', {
                active: true,
                type: 'extraction',
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
                content: '',
                complete: false,
                anchor: anchor,
                message: `Content extraction failed: ${error.message}`,
                timestamp: Date.now()
            };
        }
    }    
    /**
     * Monitor for response with anchor hash
     */
    async monitorForResponse(anchorHash, timeout = 60000, streamCallback = null) {
        if (!anchorHash) {
            return {
                success: false,
                content: '',
                complete: false,
                message: 'Anchor hash is required for response monitoring',
                timestamp: Date.now()
            };
        }
        
        console.log(`Monitoring for response with anchor: ${anchorHash}`);
        
        try {
            // Update processing state
            this.state.updateState('processing', {
                active: true,
                type: 'monitoring',
                anchor: anchorHash,
                startTime: Date.now()
            });
            
            // Perform monitoring with streaming support
            const result = await this.webSocketExtractor.monitorForResponse(anchorHash, timeout, streamCallback);
            
            if (result.success) {
                // Update processing state based on completion
                this.state.updateState('processing', {
                    active: !result.complete,
                    type: result.complete ? 'complete' : 'responding',
                    progress: result.complete ? 100 : 75
                });
                
                return {
                    success: true,
                    content: result.content,
                    complete: result.complete,
                    anchor: anchorHash,
                    elapsed: result.elapsed,
                    metadata: result.metadata,
                    message: `Response monitored successfully (${result.elapsed}ms)`,
                    timestamp: result.timestamp
                };
            } else {
                // Update error state
                this.state.updateState('errors', {
                    active: true,
                    type: 'monitoring',
                    message: result.message || 'Response monitoring failed',
                    recoverable: true,
                    timestamp: Date.now()
                });
                
                this.state.updateState('processing', {
                    active: false,
                    type: null
                });
                
                return result;
            }
            
        } catch (error) {
            this.state.updateState('errors', {
                active: true,
                type: 'monitoring',
                message: error.message,
                recoverable: true,
                timestamp: Date.now()
            });
            
            return {
                success: false,
                content: '',
                complete: false,
                anchor: anchorHash,
                message: `Response monitoring failed: ${error.message}`,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Stream content updates in real-time
     */
    async streamContentUpdates(anchorHash) {
        console.log(`Setting up content streaming for anchor: ${anchorHash}`);
        
        // For now, return null as streaming is not implemented
        // This would be implemented with WebSocket streaming in the future
        return await this.webSocketExtractor.streamContentUpdates(anchorHash);
    }
    
    /**
     * Detect response completion with multiple markers
     */
    async detectResponseCompletion(anchorHash) {
        console.log(`Detecting response completion for anchor: ${anchorHash}`);
        
        try {
            const complete = await this.webSocketExtractor.detectResponseCompletion(anchorHash);
            
            // Update processing state based on completion
            if (complete) {
                this.state.updateState('processing', {
                    active: false,
                    type: 'complete',
                    progress: 100
                });
            }
            
            return complete;
            
        } catch (error) {
            console.error(`Completion detection failed: ${error.message}`);
            return false;
        }
    }    
    /**
     * Format content as markdown
     */
    formatAsMarkdown(content) {
        // Basic markdown formatting
        return content
            .replace(/^(.+)$/gm, (match, line) => {
                // Convert simple headings
                if (line.length < 80 && !line.includes('.') && !line.includes(',')) {
                    return `## ${line}`;
                }
                return line;
            })
            .replace(/\n\n+/g, '\n\n'); // Normalize line breaks
    }
    
    /**
     * Format content as plain text
     */
    formatAsPlainText(content) {
        // Remove any HTML tags and normalize whitespace
        return content
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/\n\s*\n/g, '\n\n') // Normalize line breaks
            .trim();
    }
    
    /**
     * Complete message flow: inject message and extract response
     */
    async completeMessageFlow(message, options = {}) {
        const { timeout = 60000, extractOptions = {} } = options;
        
        console.log(`Starting complete message flow for: ${message.substring(0, 50)}...`);
        
        try {
            // Note: This would require coordination with ControlMethods
            // For now, return a placeholder indicating this needs integration
            return {
                success: false,
                message: 'Complete message flow requires integration with control methods',
                flow: 'inject -> monitor -> extract',
                timestamp: Date.now()
            };
            
        } catch (error) {
            return {
                success: false,
                message: `Message flow failed: ${error.message}`,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Clean up extraction resources
     */
    cleanup() {
        console.log('Cleaning up extraction methods...');
        this.webSocketExtractor.cleanup();
    }
}

module.exports = ExtractionMethods;