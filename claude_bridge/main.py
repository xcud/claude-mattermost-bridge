#!/usr/bin/env python3
"""
Universal Claude Desktop Bridge - Main Entry Point
Support for multiple interface types with clean plugin architecture
"""

import sys
import os
from typing import Dict, Any

# Add parent directory to path so we can import claude_bridge
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from claude_bridge.core.bridge_core import start_bridge
from claude_bridge.interfaces.mattermost import MattermostInterface
from claude_bridge.interfaces.terminal import TerminalInterface


def get_mattermost_config() -> Dict[str, Any]:
    """Get Mattermost configuration from environment variables"""
    # Required environment variables
    required_vars = ['MATTERMOST_URL', 'MATTERMOST_BOT_TOKEN', 'MATTERMOST_BOT_USER_ID', 'MATTERMOST_TEAM_ID']
    
    for var in required_vars:
        if not os.getenv(var):
            raise ValueError(f"Missing required environment variable: {var}")
    
    return {
        'mattermost_url': os.getenv('MATTERMOST_URL'),
        'bot_token': os.getenv('MATTERMOST_BOT_TOKEN'),
        'bot_user_id': os.getenv('MATTERMOST_BOT_USER_ID'),
        'team_id': os.getenv('MATTERMOST_TEAM_ID'),
        'mention_patterns': os.getenv('MATTERMOST_MENTION_PATTERNS', '@claude-oum,@claude').split(','),
        'api_url': os.getenv('CLAUDE_API_URL', 'http://localhost:3000')
    }


def main():
    """Main entry point with interface selection"""
    print("🌉 Universal Claude Desktop Bridge v2.0")
    print("=" * 50)
    
    # Interface selection
    if len(sys.argv) < 2:
        print("Usage: python main.py <interface_type>")
        print("Available interfaces:")
        print("  mattermost  - Mattermost team chat integration")
        print("  terminal    - Interactive terminal interface (future)")
        print("  webapp      - Standalone web application (future)")
        sys.exit(1)
    
    interface_type = sys.argv[1].lower()
    
    # Initialize the requested interface
    if interface_type == 'mattermost':
        print("🎯 Initializing Mattermost interface...")
        config = get_mattermost_config()
        interface = MattermostInterface(config)
        
    elif interface_type == 'terminal':
        print("🖥️  Initializing Terminal interface...")
        config = {'username': os.getenv('USER', 'terminal-user')}
        interface = TerminalInterface(config)
        
    elif interface_type == 'webapp':
        print("❌ Web app interface not yet implemented") 
        print("💡 Coming soon: Standalone web interface")
        sys.exit(1)
        
    else:
        print(f"❌ Unknown interface type: {interface_type}")
        print("Available: mattermost, terminal, webapp")
        sys.exit(1)
    
    # Start the bridge
    start_bridge(interface)


if __name__ == "__main__":
    main()
