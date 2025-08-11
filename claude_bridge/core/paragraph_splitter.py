"""
Hybrid paragraph splitter: Stream content in real-time, then delete and organize into paragraphs
"""

from typing import Optional, Callable, List
import re


class ParagraphStreamingSplitter:
    """
    Hybrid approach: Stream content in real-time, then delete and send clean paragraphs
    """
    
    def __init__(self, send_message_fn: Callable[[str], str], 
                 update_message_fn: Callable[[str, str], bool],
                 delete_message_fn: Callable[[str], bool],
                 max_paragraph_length: int = 15000):
        """
        Initialize the paragraph splitter
        
        Args:
            send_message_fn: Function to send new message (returns message_id)
            update_message_fn: Function to update existing message (message_id, content)
            delete_message_fn: Function to delete message (message_id)
            max_paragraph_length: Maximum length for a single paragraph
        """
        self.send_message = send_message_fn
        self.update_message = update_message_fn
        self.delete_message = delete_message_fn
        self.max_paragraph_length = max_paragraph_length
        
        # State tracking
        self.streaming_message_id: Optional[str] = None
        self.full_content = ""
        self.sent_paragraphs = 0
        self.is_finalized = False
        
    def process_chunk(self, new_content: str, is_complete: bool = False) -> None:
        """
        Process content: stream in real-time, then organize at completion
        
        Args:
            new_content: The complete content received so far
            is_complete: Whether this is the final chunk
        """
        if self.is_finalized:
            return
            
        # Update content
        self.full_content = new_content
        
        # During streaming: show content in real-time
        if not is_complete and not self._looks_like_completion(new_content):
            self._stream_content()
        else:
            # At completion: delete streaming message and send clean paragraphs
            print(f"🔄 Response complete - organizing into paragraphs ({len(new_content)} chars)")
            self._organize_into_paragraphs()
            self.is_finalized = True
    
    def _stream_content(self) -> None:
        """Stream content in real-time in a single message"""
        if self.streaming_message_id is None:
            # Start streaming message
            self.streaming_message_id = self.send_message(self.full_content)
            print(f"🌊 Started streaming message (ID: {self.streaming_message_id})")
        else:
            # Update streaming message
            success = self.update_message(self.streaming_message_id, self.full_content)
            if success:
                print(f"📝 Updated streaming message: {len(self.full_content)} chars")
            else:
                print(f"⚠️ Failed to update streaming message {self.streaming_message_id}")
    
    def _organize_into_paragraphs(self) -> None:
        """Delete streaming message and send clean paragraph messages"""
        # Delete the streaming message first
        if self.streaming_message_id:
            success = self.delete_message(self.streaming_message_id)
            if success:
                print(f"🗑️ Deleted streaming message (ID: {self.streaming_message_id})")
            else:
                print(f"⚠️ Failed to delete streaming message {self.streaming_message_id}")
        
        # Process content into clean paragraphs
        paragraphs = self._extract_paragraphs(self.full_content)
        
        # Send each paragraph as separate message
        for i, paragraph in enumerate(paragraphs, 1):
            if paragraph.strip():
                message_id = self.send_message(paragraph.strip())
                self.sent_paragraphs += 1
                print(f"📨 Sent paragraph #{self.sent_paragraphs}: {len(paragraph)} chars")
        
        # Send completion indicator
        if self.sent_paragraphs > 1:
            completion_msg = f"✅ Response complete ({self.sent_paragraphs} paragraphs)"
            self.send_message(completion_msg)
    
    def _extract_paragraphs(self, content: str) -> List[str]:
        """Extract paragraphs from content using double newlines"""
        # Split on double newlines
        paragraphs = content.split('\n\n')
        
        # Handle very long paragraphs
        result = []
        for paragraph in paragraphs:
            if len(paragraph) > self.max_paragraph_length:
                # Split long paragraphs on sentences
                sentences = self._split_into_sentences(paragraph)
                current_chunk = ""
                
                for sentence in sentences:
                    test_chunk = current_chunk + (" " if current_chunk else "") + sentence
                    if len(test_chunk) > self.max_paragraph_length and current_chunk:
                        result.append(current_chunk.strip())
                        current_chunk = sentence
                    else:
                        current_chunk = test_chunk
                
                if current_chunk.strip():
                    result.append(current_chunk.strip())
            else:
                result.append(paragraph)
        
        return result
    
    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences for long paragraph handling"""
        sentence_pattern = r'(?<=[.!?])\s+'
        sentences = re.split(sentence_pattern, text)
        return [s.strip() for s in sentences if s.strip()]
    
    def _looks_like_completion(self, content: str) -> bool:
        """Heuristic to detect if content looks complete"""
        if not content:
            return False
        
        completion_indicators = [
            "Let me know how",
            "should have seen", 
            "completion indicator",
            "test worked",
            "streaming worked",
            "approach works",
            "Let's try it"
        ]
        
        content_lower = content.lower()
        for indicator in completion_indicators:
            if indicator.lower() in content_lower:
                return True
        
        return False
    
    def reset(self) -> None:
        """Reset state for new conversation"""
        self.streaming_message_id = None
        self.full_content = ""
        self.sent_paragraphs = 0
        self.is_finalized = False
