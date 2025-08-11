#!/usr/bin/env python3
"""
Claude Desktop API Client
Professional Python interface for Claude Desktop automation
Replaces subprocess-based approach with clean HTTP API calls
"""

import requests
import json
import time
from typing import Dict, Any, Optional
from datetime import datetime

class ClaudeDesktopAPIError(Exception):
    """Custom exception for Claude Desktop API errors"""
    pass

class ClaudeDesktopAPI:
    """
    Python client for Claude Desktop API Server
    Provides clean, professional interface for Claude Desktop automation
    """
    
    def __init__(self, base_url: str = 'http://localhost:3000', timeout: int = 30):
        """
        Initialize the Claude Desktop API client
        
        Args:
            base_url: Base URL of the Claude Desktop API server
            timeout: Default timeout for HTTP requests in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'ClaudeDesktop-Python-Client/1.0'
        })
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """
        Make HTTP request to the API server
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint
            **kwargs: Additional arguments for requests
            
        Returns:
            API response as dictionary
            
        Raises:
            ClaudeDesktopAPIError: If request fails or API returns error
        """
        url = f"{self.base_url}{endpoint}"
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                timeout=kwargs.pop('timeout', self.timeout),
                **kwargs
            )
            
            response.raise_for_status()
            result = response.json()
            
            # Check if API returned an error
            if not result.get('success', True):
                raise ClaudeDesktopAPIError(f"API Error: {result.get('error', 'Unknown error')}")
            
            return result
            
        except requests.exceptions.RequestException as e:
            raise ClaudeDesktopAPIError(f"HTTP Error: {str(e)}")
        except json.JSONDecodeError as e:
            raise ClaudeDesktopAPIError(f"JSON Decode Error: {str(e)}")
    
    def health_check(self) -> Dict[str, Any]:
        """
        Check API server health and status
        
        Returns:
            Health status information
        """
        return self._make_request('GET', '/health')
    
    def initialize(self) -> Dict[str, Any]:
        """
        Initialize Claude Desktop interface
        
        Returns:
            Initialization result
        """
        print("🚀 Initializing Claude Desktop interface...")
        result = self._make_request('POST', '/claude/initialize')
        print("✅ Claude Desktop interface initialized")
        return result
    
    def send_message(self, message: str, metadata: Optional[Dict] = None, wait_for_response: bool = True, timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        Send message to Claude Desktop and optionally wait for response
        
        Args:
            message: Message to send to Claude
            metadata: Optional metadata to associate with the message
            wait_for_response: Whether to wait for Claude's response
            timeout: Timeout for the operation in seconds
            
        Returns:
            Message sending result and response (if wait_for_response=True)
        """
        print(f"📤 Sending message to Claude: {message[:50]}...")
        
        payload = {
            'message': message,
            'waitForResponse': wait_for_response,
            'metadata': metadata or {}
        }
        
        if timeout:
            payload['timeout'] = timeout * 1000  # Convert to milliseconds
        
        result = self._make_request('POST', '/claude/send', json=payload, timeout=timeout or self.timeout)
        
        if wait_for_response and result.get('success'):
            print(f"✅ Received response ({result.get('contentLength', 0)} characters)")
        elif result.get('success'):
            print("✅ Message sent successfully")
        
        return result
    
    def inject_message(self, message: str, metadata: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Inject message into Claude Desktop (without waiting for response)
        
        Args:
            message: Message to inject
            metadata: Optional metadata
            
        Returns:
            Injection result with anchor hash
        """
        print(f"💉 Injecting message: {message[:50]}...")
        
        payload = {
            'message': message,
            'metadata': metadata or {}
        }
        
        result = self._make_request('POST', '/claude/inject', json=payload)
        
        if result.get('success'):
            print(f"✅ Message injected with anchor: {result.get('anchor')}")
        
        return result
    
    def extract_response(self, wait_for_complete: bool = True, timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        Extract Claude's response from the interface
        
        Args:
            wait_for_complete: Whether to wait for complete response
            timeout: Timeout in seconds
            
        Returns:
            Extracted content and metadata
        """
        print("📥 Extracting Claude response...")
        
        params = {
            'waitForComplete': str(wait_for_complete).lower()
        }
        
        if timeout:
            params['timeout'] = timeout * 1000  # Convert to milliseconds
        
        result = self._make_request('GET', '/claude/extract', params=params, timeout=timeout or self.timeout)
        
        if result.get('success'):
            print(f"✅ Extracted response ({result.get('contentLength', 0)} characters)")
        
        return result
    
    def monitor_response(self, anchor: str, timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        Monitor for response using specific anchor hash
        
        Args:
            anchor: Anchor hash from message injection
            timeout: Timeout in seconds
            
        Returns:
            Response content when available
        """
        print(f"🔍 Monitoring for response with anchor: {anchor}")
        
        payload = {
            'anchor': anchor
        }
        
        if timeout:
            payload['timeout'] = timeout * 1000  # Convert to milliseconds
        
        result = self._make_request('POST', '/claude/monitor', json=payload, timeout=timeout or self.timeout)
        
        if result.get('success'):
            print(f"✅ Response captured ({result.get('contentLength', 0)} characters)")
        
        return result
    
    def get_desktop_state(self) -> Dict[str, Any]:
        """
        Get current Claude Desktop state
        
        Returns:
            Desktop state information
        """
        return self._make_request('GET', '/claude/state')
    
    def create_new_chat(self) -> Dict[str, Any]:
        """
        Create a new chat in Claude Desktop
        
        Returns:
            New chat creation result
        """
        print("🆕 Creating new chat...")
        result = self._make_request('POST', '/claude/chat/new')
        
        if result.get('success'):
            print(f"✅ New chat created: {result.get('chatId')}")
        
        return result
    
    def close(self):
        """Close the HTTP session"""
        self.session.close()
    
    def __enter__(self):
        """Context manager entry"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()

# Enhanced interface with legacy method names for backward compatibility
class EnhancedClaudeDesktopBridge:
    """
    Enhanced bridge with backward compatibility for existing Python code
    Maintains the same interface as the old subprocess-based approach
    """
    
    def __init__(self, api_base_url: str = 'http://localhost:3000'):
        """Initialize the enhanced bridge"""
        self.api = ClaudeDesktopAPI(api_base_url)
        self.last_check = datetime.now()
        self.processed_posts = set()
        self.response_buffer = ""
        
        # Initialize the Claude Desktop interface
        try:
            self.api.initialize()
        except ClaudeDesktopAPIError as e:
            print(f"⚠️  Failed to initialize Claude Desktop interface: {e}")
            print("🔄 API server may not be running. Start it with: node claude_api_server.js")
    
    def send_to_claude_desktop(self, message: str, user_info: Optional[Dict] = None, channel_info: Optional[Dict] = None) -> Optional[str]:
        """
        Send message to Claude Desktop via API (maintains legacy interface)
        
        Args:
            message: Message to send
            user_info: User information metadata
            channel_info: Channel information metadata
            
        Returns:
            Anchor hash for response monitoring, or None if failed
        """
        try:
            # Create context-framed message like the original implementation
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            channel_name = channel_info.get('name', 'unknown') if channel_info else 'unknown'
            username = user_info.get('username', 'unknown') if user_info else 'unknown'
            
            framed_message = f"[BRIDGE: #{channel_name} | User: {username} | {timestamp}] {message}"
            
            # Send message without waiting for response (for backward compatibility)
            result = self.api.inject_message(framed_message, metadata={
                'user_info': user_info,
                'channel_info': channel_info,
                'original_message': message
            })
            
            if result.get('success'):
                return result.get('anchor')
            else:
                print(f"❌ Failed to send message: {result.get('error')}")
                return None
                
        except ClaudeDesktopAPIError as e:
            print(f"❌ API Error: {e}")
            return None
    
    def extract_claude_response(self) -> Optional[str]:
        """
        Extract Claude's response (maintains legacy interface)
        
        Returns:
            Extracted response text, or None if failed
        """
        try:
            result = self.api.extract_response(wait_for_complete=True, timeout=20)
            
            if result.get('success') and result.get('content'):
                content = result['content']
                
                # Filter out our own bridge messages from the response
                lines = content.split('\n')
                filtered_lines = []
                
                for line in lines:
                    # Skip lines that look like bridge messages
                    if not line.startswith('[BRIDGE:'):
                        filtered_lines.append(line)
                
                filtered_content = '\n'.join(filtered_lines).strip()
                
                # Return the response if it's substantial and not just our input
                if len(filtered_content) > 50:  # Minimum meaningful response length
                    return filtered_content
                else:
                    print(f"❌ Response too short or filtered out: {len(filtered_content)} chars")
                    return None
            else:
                print(f"❌ Failed to extract response: {result.get('error')}")
                return None
                
        except ClaudeDesktopAPIError as e:
            print(f"❌ API Error: {e}")
            return None

# Example usage and testing
if __name__ == "__main__":
    # Test the API client
    print("🧪 Testing Claude Desktop API Client...")
    
    try:
        with ClaudeDesktopAPI() as api:
            # Check health
            health = api.health_check()
            print(f"📊 Server status: {health}")
            
            # Test message sending
            result = api.send_message("Hello Claude! This is a test from the Python API client.", wait_for_response=False)
            print(f"📤 Send result: {result}")
            
    except ClaudeDesktopAPIError as e:
        print(f"❌ Test failed: {e}")
        print("💡 Make sure the API server is running: node claude_api_server.js")
