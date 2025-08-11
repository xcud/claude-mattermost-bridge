"""
Mattermost Interface - Bridge interface for Mattermost platform
Extracted from working parts of the legacy codebase
"""

import requests
import time
import threading
from datetime import datetime
from typing import Dict, Any, Optional

from .base import PollingInterface
from ..core.bridge_core import handle_incoming_message
from ..core.manual_reset import ManualResetHandler
from ..core.health_monitor import HealthMonitor
from ..core.paragraph_splitter import ParagraphStreamingSplitter


class MattermostInterface(PollingInterface):
    """
    Mattermost platform interface for Claude Desktop bridge
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize Mattermost interface
        
        Args:
            config: Configuration containing mattermost_url, bot_token, bot_user_id
        """
        super().__init__(config)
        
        # Required configuration
        self.mattermost_url = config['mattermost_url']
        self.bot_token = config['bot_token'] 
        self.bot_user_id = config['bot_user_id']
        self.api_url = config.get('api_url', 'http://localhost:3000')
        
        # Optional configuration
        self.mention_patterns = config.get('mention_patterns', ['@claude-oum', '@claude'])
        
        # Request headers
        self.headers = {
            "Authorization": f"Bearer {self.bot_token}",
            "Content-Type": "application/json"
        }
        
        # State tracking
        self.last_check = datetime.now()
        self.processed_posts = set()
        
        # Manual reset handler
        self.reset_handler = ManualResetHandler()
        
        # Health monitor
        self.health_monitor = HealthMonitor({
            'api_url': self.api_url,
            'health_check_interval': 30,  # Check every 30 seconds
            'max_reconnect_attempts': 3,
            'reconnect_delay': 5
        })
        
        # Set up health change notifications
        self.health_monitor.add_health_change_callback(self._on_health_change)
    
    def start(self) -> None:
        """Start the Mattermost polling loop"""
        print("🌉 Mattermost ↔ Claude Desktop Bridge starting...")
        print(f"📱 Monitoring for mentions: {', '.join(self.mention_patterns)}")
        print("🛑 Press Ctrl+C to stop\n")
        
        # Get channels to monitor
        channels = self.get_channels()
        if not channels:
            print("❌ No channels accessible")
            return
            
        print(f"👂 Monitoring {len(channels)} channels...")
        
        # Start health monitoring
        self.health_monitor.start_monitoring()
        print("🏥 Health monitoring started")
        
        self.running = True
        try:
            while self.running:
                self.poll_for_messages()
                time.sleep(self.get_poll_interval())
                
        except KeyboardInterrupt:
            print("\n🛑 Stopping Mattermost bridge...")
            self.stop()
    
    def stop(self) -> None:
        """Stop the interface"""
        self.running = False
        self.health_monitor.stop_monitoring()
        print("🏥 Health monitoring stopped")
    
    def poll_for_messages(self) -> None:
        """Poll for new messages and process mentions"""
        try:
            current_time = datetime.now()
            
            # Get channels to monitor
            channels = self.get_channels()
            if not channels:
                return
            
            # Check each channel for new messages
            for channel in channels:
                posts_data = self.get_recent_posts(channel['id'], self.last_check)
                if posts_data:
                    self._check_for_mentions(posts_data, channel)
            
            self.last_check = current_time
            print(".", end="", flush=True)  # Activity indicator
            
        except Exception as e:
            print(f"❌ Error polling messages: {e}")
    
    def _check_for_mentions(self, posts_data: Dict, channel: Dict) -> None:
        """Check posts for bot mentions and process them"""
        if not posts_data or 'posts' not in posts_data:
            return
            
        for post_id, post in posts_data['posts'].items():
            # Skip if already processed
            if post_id in self.processed_posts:
                continue
                
            # Skip bot's own messages
            if post.get('user_id') == self.bot_user_id:
                continue
                
            message = post.get('message', '')
            
            # Check for mentions
            if any(pattern.lower() in message.lower() for pattern in self.mention_patterns):
                print(f"\n🎯 Mention detected: {message[:100]}...")
                
                # Get user info first (needed for both reset commands and regular messages)
                user_info = self.get_user_info(post.get('user_id'))
                
                # Check for manual reset commands first (handle immediately, don't send to Claude)
                was_reset_command, reset_response = self.reset_handler.handle_reset_command(message, user_info)
                
                if was_reset_command:
                    print(f"🔧 Manual reset command detected, executing...")
                    # Send reset response immediately
                    self.send_response(channel['id'], reset_response)
                    # Mark as processed and continue to next message
                    self.processed_posts.add(post_id)
                    continue
                
                # Check for health status commands
                if 'health' in message.lower() and any(cmd in message.lower() for cmd in ['status', 'check']):
                    print(f"🏥 Health status command detected")
                    health_status = self._get_health_status_message()
                    self.send_response(channel['id'], health_status)
                    self.processed_posts.add(post_id)
                    continue
                
                # Regular message processing (not a reset command)
                print(f"💬 Regular message, sending to Claude...")
                
                # Check for new thread command
                new_thread = any(cmd in message.lower() for cmd in ['!new', '!newthread', '!new-thread'])
                if new_thread:
                    print("🆕 New conversation thread requested")
                
                # Platform info
                platform_info = {
                    'name': channel.get('name', 'unknown'),
                    'id': channel.get('id'),
                    'type': 'mattermost'
                }
                
                # Create response callback with hybrid streaming approach
                paragraph_splitter = None
                
                def response_callback(response_content: str):
                    nonlocal paragraph_splitter
                    
                    if paragraph_splitter is None:
                        # Initialize paragraph splitter with channel-specific functions
                        def send_fn(content):
                            return self.send_response(channel['id'], content)
                        
                        def update_fn(msg_id, content):
                            return self.update_message(msg_id, content)
                        
                        def delete_fn(msg_id):
                            return self.delete_message(msg_id)
                        
                        paragraph_splitter = ParagraphStreamingSplitter(
                            send_message_fn=send_fn,
                            update_message_fn=update_fn,
                            delete_message_fn=delete_fn
                        )
                    
                    # Process the streaming content with hybrid approach
                    paragraph_splitter.process_chunk(response_content)
                
                # Handle the message
                handle_incoming_message(
                    message=message,
                    user_info=user_info,
                    platform_info=platform_info,
                    platform_type='mattermost',
                    response_callback=response_callback,
                    api_url=self.api_url,
                    new_thread=new_thread
                )
            
            # Mark as processed
            self.processed_posts.add(post_id)
    
    def send_response(self, target: str, message: str, 
                     reply_to: Optional[str] = None) -> Optional[str]:
        """Send response message to Mattermost channel and return message ID"""
        return self.send_message(target, message, reply_to)
    
    def get_platform_type(self) -> str:
        """Get platform type identifier"""
        return 'mattermost'
    
    # Mattermost API helper methods (extracted from working legacy code)
    
    def get_channels(self) -> Optional[list]:
        """Get channels the bot has access to"""
        try:
            # Get team_id from configuration (set during initialization)
            team_id = self.config.get('team_id')
            if not team_id:
                raise ValueError("team_id not provided in configuration")
            
            response = requests.get(
                f"{self.mattermost_url}/api/v4/users/me/teams/{team_id}/channels",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"❌ Error getting channels: {response.status_code}")
                return None
        except Exception as e:
            print(f"❌ Error getting channels: {e}")
            return None
    
    def get_recent_posts(self, channel_id: str, since_timestamp: datetime) -> Optional[Dict]:
        """Get recent posts from a channel"""
        try:
            since_ms = int(since_timestamp.timestamp() * 1000)
            
            response = requests.get(
                f"{self.mattermost_url}/api/v4/channels/{channel_id}/posts",
                headers=self.headers,
                params={"since": since_ms},
                timeout=10
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"❌ Error getting posts: {response.status_code}")
                return None
        except Exception as e:
            print(f"❌ Error getting recent posts: {e}")
            return None
    
    def get_user_info(self, user_id: str) -> Optional[Dict]:
        """Get user information by ID"""
        try:
            response = requests.get(
                f"{self.mattermost_url}/api/v4/users/{user_id}",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"❌ Error getting user info: {response.status_code}")
                return None
        except Exception as e:
            print(f"❌ Error getting user info: {e}")
            return None
    
    def send_message(self, channel_id: str, message: str, 
                    reply_to_id: Optional[str] = None) -> Optional[str]:
        """Send a message to a channel and return message ID"""
        try:
            data = {
                "channel_id": channel_id,
                "message": message
            }
            if reply_to_id:
                data["root_id"] = reply_to_id
                
            response = requests.post(
                f"{self.mattermost_url}/api/v4/posts",
                headers=self.headers,
                json=data,
                timeout=15
            )
            
            if response.status_code == 201:
                post_data = response.json()
                message_id = post_data.get('id')
                print(f"✅ Message sent to Mattermost (ID: {message_id})")
                return message_id
            else:
                print(f"❌ Failed to send message: {response.status_code}")
                return None
        except Exception as e:
            print(f"❌ Error sending message: {e}")
            return None
    
    def update_message(self, message_id: str, new_content: str) -> bool:
        """Update an existing message (for streaming responses)"""
        try:
            data = {
                "id": message_id,
                "message": new_content
            }
            
            response = requests.put(
                f"{self.mattermost_url}/api/v4/posts/{message_id}",
                headers=self.headers,
                json=data,
                timeout=15
            )
            
            if response.status_code == 200:
                print(f"✅ Message updated in Mattermost (ID: {message_id})")
                return True
            else:
                print(f"❌ Failed to update message: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Error updating message: {e}")
            return False
    
    def delete_message(self, message_id: str) -> bool:
        """Delete a message (for hybrid streaming approach)"""
        try:
            response = requests.delete(
                f"{self.mattermost_url}/api/v4/posts/{message_id}",
                headers=self.headers,
                timeout=15
            )
            
            if response.status_code == 200:
                print(f"✅ Message deleted from Mattermost (ID: {message_id})")
                return True
            else:
                print(f"❌ Failed to delete message: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Error deleting message: {e}")
            return False
    
    def _on_health_change(self, component: str, is_healthy: bool, status: dict):
        """Handle health status changes - can notify via Mattermost if needed"""
        if not is_healthy and status['consecutive_failures'] >= 2:
            print(f"🚨 {component} has been unhealthy for {status['consecutive_failures']} checks")
            # Could send alerts to Mattermost channel here if desired
    
    def _get_health_status_message(self) -> str:
        """Get formatted health status message"""
        try:
            # Force immediate health check
            health_results = self.health_monitor.force_health_check()
            status = self.health_monitor.get_health_status()
            
            message = "🏥 **Bridge Health Status**\n\n"
            
            # Overall status
            overall = "✅ All systems healthy" if status['overall_healthy'] else "⚠️ Some systems unhealthy"
            message += f"**Overall:** {overall}\n\n"
            
            # Component details
            message += "**Components:**\n"
            for component, health in health_results.items():
                icon = "✅" if health else "❌"
                comp_status = status['components'][component]
                failures = comp_status['consecutive_failures']
                
                message += f"• {icon} **{component.replace('_', ' ').title()}**"
                if not health and failures > 0:
                    message += f" (failed {failures} times)"
                message += "\n"
            
            message += f"\n**Last Check:** {status['last_check']}"
            
            return message
            
        except Exception as e:
            return f"❌ Error getting health status: {str(e)}"
