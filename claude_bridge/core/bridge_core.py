"""
Bridge Core - Universal coordination logic for Claude Desktop bridge
Platform-agnostic orchestration of message flow with streaming support
"""

import time
import threading
import requests
from typing import Dict, Any, Optional, Callable
from datetime import datetime

from .claude_api import send_to_claude, start_websocket_monitoring, health_check
from .message_processing import (
    frame_message_with_context, 
    format_for_platform,
    is_substantial_response,
    clean_mention_from_message
)


def handle_incoming_message(message: str, user_info: Optional[Dict] = None,
                           platform_info: Optional[Dict] = None,
                           platform_type: str = 'generic',
                           response_callback: Optional[Callable] = None,
                           api_url: str = 'http://localhost:3000',
                           new_thread: bool = False) -> Optional[str]:
    """
    Handle an incoming message from any platform interface
    
    Args:
        message: The message content
        user_info: Information about the user who sent the message
        platform_info: Information about the platform/channel/context
        platform_type: Type of platform ('mattermost', 'terminal', 'webapp')
        response_callback: Function to call when response is ready
        api_url: Claude Desktop API server URL
        
    Returns:
        Anchor hash for response monitoring, or None if failed
    """
    try:
        print(f"🎯 Processing message from {platform_type}: {message[:50]}...")
        
        # Clean the message (remove mentions, etc.)
        clean_message = clean_mention_from_message(message)
        
        if not clean_message.strip():
            print("❌ No content after cleaning message")
            return None
        
        # Frame the message with context
        framed_message = frame_message_with_context(
            clean_message, 
            user_info, 
            platform_info
        )
        
        # Send to Claude Desktop
        metadata = {'new_thread': new_thread} if new_thread else None
        anchor_hash = send_to_claude(framed_message, metadata=metadata)
        
        if anchor_hash:
            # Start monitoring for response in background
            if response_callback:
                monitor_thread = threading.Thread(
                    target=_monitor_and_callback,
                    args=(anchor_hash, platform_type, response_callback, api_url),
                    daemon=True
                )
                monitor_thread.start()
            
            return anchor_hash
        else:
            print("❌ Failed to send message to Claude")
            return None
            
    except Exception as e:
        print(f"❌ Error handling message: {e}")
        return None


def _monitor_and_callback(anchor_hash: str, platform_type: str, 
                         callback: Callable[[str], None], 
                         api_url: str = 'http://localhost:3000') -> None:
    """
    Monitor for response using WebSocket streaming and call callback when ready
    
    Args:
        anchor_hash: Anchor hash to monitor
        platform_type: Platform type for formatting
        callback: Function to call with formatted response
    """
    try:
        print(f"📡 Starting WebSocket streaming monitor for {platform_type}...")
        
        last_content = ""
        response_complete = False
        
        def stream_callback(event_name, *args):
            nonlocal last_content, response_complete
            
            print(args[0])
            # Handle proactive response updates
            if event_name in ['response_update', 'response_complete'] and args:
                data = args[0]
                if data.get('anchor') == anchor_hash:
                    content = data.get('content', '')
                    complete = data.get('complete', False)
                    
                    if content and content != last_content:
                        # Send incremental updates as they arrive - let platform decide how to handle
                        print(f"📥 WebSocket content update: {len(content)} chars (complete: {complete})")
                        formatted = format_for_platform(content, platform_type)
                        callback(formatted)
                        last_content = content
                        
                        if complete or event_name == 'response_complete':
                            response_complete = True
                            print("✅ Response marked complete via WebSocket")
            
            # Legacy streaming support (keeping for compatibility)
            elif event_name == 'response_streaming' and args:
                data = args[0]
                if data.get('anchor') == anchor_hash:
                    content = data.get('content', '')
                    complete = data.get('complete', False)
                    
                    if content and content != last_content:
                        # Send incremental updates - let platform handle appropriately
                        formatted = format_for_platform(content, platform_type)
                        if formatted and is_substantial_response(formatted):
                            print(f"📤 Streaming update: {len(formatted)} chars (complete: {complete})")
                            callback(formatted)
                            last_content = content
                            
                    if complete and not response_complete:
                        response_complete = True
                        print(f"✅ Stream complete for {anchor_hash}")
            
            elif event_name == 'response_monitored' and args:
                data = args[0]
                if data.get('anchor') == anchor_hash and not response_complete:
                    # Final fallback if streaming didn't work
                    print("📡 Using fallback response monitoring")
                    if not last_content:
                        callback("❌ No response received from Claude Desktop")
        
        # Start WebSocket monitoring with streaming callback
        websocket_client = start_websocket_monitoring(event_callback=stream_callback)
        
        # Hybrid approach: WebSocket + Polling
        timeout_seconds = 180
        start_time = time.time()
        last_poll_time = 0
        poll_interval = 3  # Poll every 3 seconds as fallback
        
        while (time.time() - start_time) < timeout_seconds and not response_complete:
            current_time = time.time()
            
            # Polling fallback - monitor for anchor-specific content
            if current_time - last_poll_time >= poll_interval:
                try:
                    print("🔄 Polling for response content...")
                    payload = {
                        'anchor': anchor_hash,
                        'timeout': 5000  # 5 second timeout for polling
                    }
                    response = requests.post(f"{api_url}/claude/monitor", 
                                           json=payload, 
                                           timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        if data.get('success') and data.get('content'):
                            print(f"📥 Polled content: {len(data['content'])} chars")
                            
                            # Send incremental updates from polling as well
                            new_content = data['content']
                            if new_content != last_content:
                                print(f"📤 Polling update: {len(new_content)} chars (complete: {data.get('complete', False)})")
                                last_content = new_content
                                callback(new_content)
                                if data.get('complete', False):
                                    response_complete = True
                                    break
                        else:
                            print(f"📡 Poll response: success={data.get('success')}, has_content={bool(data.get('content'))}")
                    else:
                        print(f"❌ Poll failed with status: {response.status_code}")
                except requests.RequestException as e:
                    print(f"❌ Polling error (likely timeout): {e}")
                
                last_poll_time = current_time
            
            time.sleep(1)
        
        # Determine why we exited the loop
        final_time = time.time()
        total_duration = final_time - start_time
        timed_out = total_duration >= timeout_seconds
        
        if timed_out:
            print(f"⏰ Loop exited due to TIMEOUT after {total_duration:.1f}s (limit: {timeout_seconds}s)")
        else:
            print(f"✅ Loop exited due to COMPLETION after {total_duration:.1f}s")
        
        if not response_complete and not last_content:
            if timed_out:
                print("⏰ Streaming timeout, no content received")
                callback("❌ Response timeout - no content received")
            else:
                print("❌ Loop ended but no content was captured")
                callback("❌ Response monitoring failed - no content received")
        
        # Cleanup
        if websocket_client:
            websocket_client.disconnect()
            
    except Exception as e:
        print(f"❌ Error in streaming monitor: {e}")
        callback(f"❌ Error monitoring response: {e}")


def check_api_health(api_url: str = 'http://localhost:3000') -> bool:
    """
    Check if Claude Desktop API is accessible
    
    Args:
        api_url: API server URL
        
    Returns:
        True if healthy, False otherwise
    """
    return health_check(api_url)


def start_bridge(interface_instance, api_url: str = 'http://localhost:3000') -> None:
    """
    Start the bridge with a specific interface
    
    Args:
        interface_instance: Instance of an interface (must implement interface protocol)
        api_url: Claude Desktop API server URL
    """
    print("🌉 Starting Universal Claude Desktop Bridge...")
    print(f"🔗 Interface: {interface_instance.__class__.__name__}")
    print(f"🖥️  API URL: {api_url}")
    
    # Health check
    if not check_api_health(api_url):
        print("❌ Claude Desktop API server not accessible!")
        print("💡 Start it with: node claude_api_server.js")
        return
    
    print("✅ Claude Desktop API server is healthy")
    
    # Start the interface
    try:
        interface_instance.start()
    except KeyboardInterrupt:
        print("\n🛑 Bridge stopped by user")
    except Exception as e:
        print(f"❌ Bridge error: {e}")
    finally:
        if hasattr(interface_instance, 'cleanup'):
            interface_instance.cleanup()
