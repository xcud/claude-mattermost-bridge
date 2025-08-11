"""
Base Interface Protocol - Standard interface that all platform plugins must implement
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class BridgeInterface(ABC):
    """
    Abstract base class for bridge interfaces
    All platform implementations must inherit from this
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the interface
        
        Args:
            config: Configuration dictionary for the interface
        """
        self.config = config or {}
        self.running = False
    
    @abstractmethod
    def start(self) -> None:
        """
        Start the interface (main loop, server, etc.)
        This method should block until stopped
        """
        pass
    
    @abstractmethod
    def stop(self) -> None:
        """
        Stop the interface gracefully
        """
        pass
    
    @abstractmethod
    def send_response(self, target: str, message: str, 
                     reply_to: Optional[str] = None) -> bool:
        """
        Send a response message to the target
        
        Args:
            target: Target identifier (channel_id, user_id, etc.)
            message: Message content to send
            reply_to: Optional ID of message being replied to
            
        Returns:
            True if sent successfully, False otherwise
        """
        pass
    
    def cleanup(self) -> None:
        """
        Optional cleanup method called when bridge shuts down
        Override this if your interface needs cleanup
        """
        pass
    
    def get_platform_type(self) -> str:
        """
        Get the platform type identifier
        Override this in subclasses
        
        Returns:
            Platform type string (e.g., 'mattermost', 'terminal', 'webapp')
        """
        return 'generic'


class StreamingInterface(BridgeInterface):
    """
    Extended interface for platforms that support streaming/real-time updates
    """
    
    @abstractmethod
    def update_response(self, target: str, message_id: str, 
                       updated_content: str) -> bool:
        """
        Update an existing message with new content (for streaming responses)
        
        Args:
            target: Target identifier
            message_id: ID of message to update
            updated_content: New content for the message
            
        Returns:
            True if updated successfully, False otherwise
        """
        pass
    
    def supports_streaming(self) -> bool:
        """
        Check if this interface supports streaming updates
        
        Returns:
            True if streaming is supported
        """
        return True


class PollingInterface(BridgeInterface):
    """
    Interface for platforms that need to poll for messages
    """
    
    @abstractmethod
    def poll_for_messages(self) -> None:
        """
        Poll for new messages and process them
        This should be called in a loop by the start() method
        """
        pass
    
    def get_poll_interval(self) -> float:
        """
        Get polling interval in seconds
        Override to customize polling frequency
        
        Returns:
            Polling interval in seconds (default: 2.0)
        """
        return 2.0
