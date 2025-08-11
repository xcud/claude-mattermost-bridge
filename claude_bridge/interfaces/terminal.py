"""
Terminal Interface - Interactive CLI for Claude Desktop bridge
Demonstrates the universal bridge architecture
"""

import os
import sys
import threading
from typing import Dict, Any, Optional

from .base import BridgeInterface
from ..core.bridge_core import handle_incoming_message


class TerminalInterface(BridgeInterface):
    """
    Terminal/CLI interface for Claude Desktop bridge
    Provides interactive command-line access to Claude
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize terminal interface"""
        super().__init__(config)
        self.username = config.get('username', 'terminal-user') if config else 'terminal-user'
    
    def start(self) -> None:
        """Start the interactive terminal session"""
        print("🖥️  Claude Desktop Terminal Interface")
        print("=" * 40)
        print("💬 Type your messages to Claude")
        print("🛑 Press Ctrl+C to exit")
        print("📝 Type 'help' for commands")
        print()
        
        self.running = True
        
        try:
            while self.running:
                # Get user input
                try:
                    user_input = input("You: ").strip()
                except EOFError:
                    break
                
                if not user_input:
                    continue
                
                # Handle special commands
                if user_input.lower() in ['quit', 'exit', 'q']:
                    break
                elif user_input.lower() == 'help':
                    self._show_help()
                    continue
                elif user_input.lower() == 'clear':
                    os.system('clear' if os.name == 'posix' else 'cls')
                    continue
                
                # Send to Claude
                print("Claude: ", end="", flush=True)
                
                # Create response callback for terminal output
                response_event = threading.Event()
                
                def response_callback(response_content: str):
                    print(response_content)
                    print()  # Extra line for readability
                    response_event.set()
                
                # Process the message
                user_info = {'username': self.username}
                platform_info = {'name': 'terminal', 'type': 'cli'}
                
                anchor_hash = handle_incoming_message(
                    message=user_input,
                    user_info=user_info,
                    platform_info=platform_info,
                    platform_type='terminal',
                    response_callback=response_callback
                )
                
                if anchor_hash:
                    # Wait for response (with timeout)
                    if not response_event.wait(timeout=180):
                        print("❌ Response timeout")
                        print()
                else:
                    print("❌ Failed to send message to Claude")
                    print()
                    
        except KeyboardInterrupt:
            print("\n🛑 Terminal interface stopped")
        finally:
            self.stop()
    
    def stop(self) -> None:
        """Stop the interface"""
        self.running = False
    
    def send_response(self, target: str, message: str, 
                     reply_to: Optional[str] = None) -> bool:
        """Send response (not used in terminal mode)"""
        print(message)
        return True
    
    def get_platform_type(self) -> str:
        """Get platform type identifier"""
        return 'terminal'
    
    def _show_help(self) -> None:
        """Show help information"""
        print()
        print("📖 Terminal Interface Commands:")
        print("  help      - Show this help message")
        print("  clear     - Clear the terminal screen")
        print("  quit/exit - Exit the terminal interface")
        print("  <message> - Send message to Claude Desktop")
        print()
