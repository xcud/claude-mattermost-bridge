"""
Claude Desktop API - Clean HTTP functions for Claude Desktop automation
Extracted from working parts of the legacy codebase
"""

import requests
import json
import time
from typing import Dict, Any, Optional
from datetime import datetime


def send_to_claude(message: str, metadata: Optional[Dict] = None, 
                  api_url: str = 'http://localhost:3000') -> Optional[str]:
    """
    Send message to Claude Desktop via HTTP API
    
    Args:
        message: Message to send to Claude
        metadata: Optional metadata to associate with message
        api_url: Claude Desktop API server URL
        
    Returns:
        Anchor hash for response monitoring, or None if failed
    """
    try:
        print(f"📤 Sending to Claude: {message[:50]}...")
        
        payload = {
            'message': message,
            'metadata': metadata or {}
        }
        
        response = requests.post(
            f"{api_url}/claude/inject",
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                anchor = result.get('anchor')
                print(f"✅ Message sent with anchor: {anchor}")
                return anchor
            else:
                print(f"❌ API error: {result.get('error')}")
                return None
        else:
            print(f"❌ HTTP error: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Send failed: {e}")
        return None


def monitor_response(anchor_hash: str, timeout: int = 180,
                    api_url: str = 'http://localhost:3000') -> Optional[str]:
    """
    Monitor for Claude's response using anchor hash
    
    Args:
        anchor_hash: Anchor hash from send_to_claude
        timeout: Timeout in seconds
        api_url: Claude Desktop API server URL
        
    Returns:
        Response content when available, or None if failed/timeout
    """
    try:
        print(f"📡 Monitoring for response with anchor: {anchor_hash}")
        
        payload = {
            'anchor': anchor_hash,
            'timeout': timeout * 1000  # Convert to milliseconds
        }
        
        response = requests.post(
            f"{api_url}/claude/monitor",
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=timeout + 10  # Give extra time for HTTP timeout
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                content = result.get('content', '').strip()
                print(f"✅ Response captured ({len(content)} chars)")
                return content
            else:
                print(f"❌ Monitor error: {result.get('error')}")
                return None
        else:
            print(f"❌ HTTP error: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Monitor failed: {e}")
        return None


def extract_response(wait_complete: bool = True, timeout: int = 20,
                    api_url: str = 'http://localhost:3000') -> Optional[str]:
    """
    Extract Claude's current response from desktop
    
    Args:
        wait_complete: Whether to wait for complete response
        timeout: Timeout in seconds  
        api_url: Claude Desktop API server URL
        
    Returns:
        Extracted response content, or None if failed
    """
    try:
        print("📥 Extracting Claude response...")
        
        params = {
            'waitForComplete': str(wait_complete).lower(),
            'timeout': timeout * 1000
        }
        
        response = requests.get(
            f"{api_url}/claude/extract",
            params=params,
            headers={'Content-Type': 'application/json'},
            timeout=timeout + 5
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                content = result.get('content', '').strip()
                print(f"✅ Response extracted ({len(content)} chars)")
                return content
            else:
                print(f"❌ Extract error: {result.get('error')}")
                return None
        else:
            print(f"❌ HTTP error: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Extract failed: {e}")
        return None


def get_desktop_state(api_url: str = 'http://localhost:3000') -> Optional[Dict]:
    """
    Get current Claude Desktop state
    
    Args:
        api_url: Claude Desktop API server URL
        
    Returns:
        Desktop state information, or None if failed
    """
    try:
        response = requests.get(
            f"{api_url}/claude/state",
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                return result.get('state', {})
            else:
                print(f"❌ State error: {result.get('error')}")
                return None
        else:
            print(f"❌ HTTP error: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ State check failed: {e}")
        return None


def health_check(api_url: str = 'http://localhost:3000') -> bool:
    """
    Check if Claude Desktop API server is accessible
    
    Args:
        api_url: Claude Desktop API server URL
        
    Returns:
        True if server is healthy, False otherwise
    """
    try:
        response = requests.get(
            f"{api_url}/health",
            timeout=5
        )
        
        if response.status_code == 200:
            result = response.json()
            return result.get('status') == 'healthy'
        else:
            return False
            
    except Exception:
        return False

import socketio
import threading
from typing import Callable


# WebSocket client for real-time API monitoring
class ClaudeAPIWebSocketClient:
    """
    WebSocket client to monitor real-time events from Claude Desktop API
    Used for investigation and potentially streaming responses
    """
    
    def __init__(self, api_url: str = 'http://localhost:3000'):
        """Initialize WebSocket client"""
        self.api_url = api_url
        self.sio = socketio.Client(logger=False)
        self.connected = False
        self.event_callback = None
        
        # Register event handlers
        self.sio.on('connect', self._on_connect)
        self.sio.on('disconnect', self._on_disconnect) 
        self.sio.on('*', self._on_any_event)  # Catch all events
    
    def connect(self, event_callback: Optional[Callable] = None) -> bool:
        """
        Connect to the API WebSocket server
        
        Args:
            event_callback: Optional callback for received events
            
        Returns:
            True if connected successfully
        """
        try:
            self.event_callback = event_callback
            print(f"🔌 Connecting to WebSocket: {self.api_url}")
            
            self.sio.connect(self.api_url)
            
            # Wait a moment for connection
            time.sleep(0.5)
            return self.connected
            
        except Exception as e:
            print(f"❌ WebSocket connection failed: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from WebSocket server"""
        if self.connected:
            print("🔌 Disconnecting from WebSocket")
            self.sio.disconnect()
    
    def _on_connect(self):
        """Handle WebSocket connection"""
        self.connected = True
        print("✅ WebSocket connected")
    
    def _on_disconnect(self):
        """Handle WebSocket disconnection"""
        self.connected = False
        print("🔌 WebSocket disconnected")
    
    def _on_any_event(self, event_name, *args):
        """Handle any WebSocket event (for investigation)"""
        print(f"📡 WebSocket event: {event_name}")
        if args:
            print(f"📡 Event data: {args}")
        
        # Call user callback if provided
        if self.event_callback:
            self.event_callback(event_name, *args)


def start_websocket_monitoring(api_url: str = 'http://localhost:3000', 
                             event_callback: Optional[Callable] = None) -> ClaudeAPIWebSocketClient:
    """
    Start WebSocket monitoring in background thread
    
    Args:
        api_url: API server URL
        event_callback: Optional callback for events
        
    Returns:
        WebSocket client instance
    """
    client = ClaudeAPIWebSocketClient(api_url)
    
    def monitor_thread():
        if client.connect(event_callback):
            print("🔍 WebSocket monitoring started")
            # Keep connection alive
            try:
                while client.connected:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass
        client.disconnect()
    
    thread = threading.Thread(target=monitor_thread, daemon=True)
    thread.start()
    
    return client


def investigate_websocket_events(api_url: str = 'http://localhost:3000', 
                               duration: int = 30):
    """
    Investigate what events the API WebSocket sends (for debugging)
    
    Args:
        api_url: API server URL
        duration: How long to monitor in seconds
    """
    events_received = []
    
    def log_event(event_name, *args):
        timestamp = datetime.now().strftime('%H:%M:%S.%f')[:-3]
        events_received.append({
            'timestamp': timestamp,
            'event': event_name,
            'data': args
        })
        print(f"[{timestamp}] 📡 {event_name}: {args}")
    
    print(f"🔍 Investigating WebSocket events for {duration} seconds...")
    client = start_websocket_monitoring(api_url, log_event)
    
    # Wait for investigation period
    time.sleep(duration)
    
    client.disconnect()
    
    print(f"\n📊 Investigation complete! Received {len(events_received)} events:")
    for event in events_received:
        print(f"  [{event['timestamp']}] {event['event']}")
    
    return events_received
