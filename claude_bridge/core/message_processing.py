"""
Message Processing - Universal text formatting and parsing utilities
Extracted from working parts of the legacy codebase
"""

import re
from datetime import datetime
from typing import Dict, Any, Optional


def frame_message_with_context(message: str, user_info: Optional[Dict] = None,
                              platform_info: Optional[Dict] = None) -> str:
    """
    Frame a message with context information for Claude
    
    Args:
        message: Original message content
        user_info: Information about the user (username, etc.)
        platform_info: Information about the platform/channel
        
    Returns:
        Framed message with context
    """
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    # Extract platform details
    platform_name = 'unknown'
    if platform_info:
        platform_name = platform_info.get('name', 'unknown')
    
    # Extract user details  
    username = 'unknown'
    if user_info:
        username = user_info.get('username', 'unknown')
    
    # Create context frame
    framed_message = f"[BRIDGE: #{platform_name} | User: {username} | {timestamp}] {message}"
    
    return framed_message


def format_for_platform(response_text: str, platform_type: str = 'generic') -> str:
    """
    Format Claude's response for a specific platform
    
    Args:
        response_text: Raw response from Claude
        platform_type: Target platform ('mattermost', 'terminal', 'webapp')
        
    Returns:
        Formatted response text
    """
    if not response_text or not response_text.strip():
        return ""
    
    # Clean up the response text
    lines = response_text.split('\n')
    clean_lines = []
    
    for line in lines:
        # Only strip trailing whitespace, preserve leading for formatting
        line_cleaned = line.rstrip()
        
        # Skip obvious UI noise but keep most content
        if (not line_cleaned.startswith('===') and
            not line_cleaned.startswith('=== EXTRACTED') and
            not line_cleaned.startswith('=== END') and
            not line_cleaned.startswith('[BRIDGE:')):  # Skip our own frame messages
            clean_lines.append(line_cleaned)
    
    # Join with proper line breaks
    formatted = '\n'.join(clean_lines)
    
    # Remove excessive blank lines (more than 2 consecutive)
    formatted = re.sub(r'\n{3,}', '\n\n', formatted)
    
    # Platform-specific formatting
    if platform_type == 'mattermost':
        # Mattermost supports markdown
        pass  # Keep as-is for now
    elif platform_type == 'terminal':
        # Terminal might need different formatting
        pass  # Keep as-is for now  
    elif platform_type == 'webapp':
        # Web app might need HTML conversion
        pass  # Keep as-is for now
    
    # Trim whitespace
    formatted = formatted.strip()
    
    return formatted


def parse_response_content(raw_content: str) -> str:
    """
    Parse and clean raw response content from Claude
    
    Args:
        raw_content: Raw content extracted from Claude Desktop
        
    Returns:
        Cleaned response content
    """
    if not raw_content:
        return ""
    
    # Filter out our own bridge messages from the response
    lines = raw_content.split('\n')
    filtered_lines = []
    
    for line in lines:
        # Skip lines that look like bridge messages or UI elements
        if (not line.startswith('[BRIDGE:') and
            not line.startswith('===') and  
            len(line.strip()) > 0):
            filtered_lines.append(line)
    
    filtered_content = '\n'.join(filtered_lines).strip()
    
    return filtered_content


def is_substantial_response(content: str, min_length: int = 50) -> bool:
    """
    Check if response content is substantial enough to send
    
    Args:
        content: Response content to check
        min_length: Minimum character length for substantial response
        
    Returns:
        True if response is substantial, False otherwise
    """
    if not content or not content.strip():
        return False
    
    # Check length
    if len(content.strip()) < min_length:
        return False
    
    # Check if it's just our own input echoed back
    if content.strip().startswith('[BRIDGE:'):
        return False
    
    return True


def clean_mention_from_message(message: str, mention_patterns: list = None) -> str:
    """
    Remove mention patterns from message
    
    Args:
        message: Original message with mentions
        mention_patterns: List of mention patterns to remove
        
    Returns:
        Cleaned message without mentions
    """
    if not mention_patterns:
        mention_patterns = ['@claude-oum', '@claude']
    
    cleaned = message
    for pattern in mention_patterns:
        cleaned = cleaned.replace(pattern, '').strip()
    
    # Remove new thread commands
    thread_commands = ['/new', '--new-thread', '/newthread']
    for cmd in thread_commands:
        cleaned = cleaned.replace(cmd, '').strip()
    
    return cleaned
