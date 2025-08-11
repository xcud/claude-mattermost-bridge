"""
Manual Reset Commands - Handle bridge reset functionality
"""

import subprocess
import time
import os
import signal
from typing import Dict, Any, Optional, Tuple


class ManualResetHandler:
    """Handler for manual reset commands sent via chat interface"""
    
    def __init__(self):
        self.reset_commands = {
            'all': self._reset_all,
            'claude': self._reset_claude,
            'api': self._reset_api,
            'bridge': self._reset_bridge,
            'help': self._reset_help,
            'status': self._reset_status
        }
    
    def handle_reset_command(self, message: str, user_info: Optional[Dict] = None) -> Tuple[bool, str]:
        """
        Check if message is a reset command and handle it
        
        Args:
            message: The incoming message
            user_info: Information about the user (for authorization)
            
        Returns:
            Tuple of (was_handled, response_message)
        """
        # Check if this is a reset command
        if not self._is_reset_command(message):
            return False, ""
        
        # Extract command target
        target = self._extract_reset_target(message)
        
        # Execute the reset
        try:
            if target in self.reset_commands:
                response = self.reset_commands[target]()
                
                # Special handling for bridge restart - execute the actual restart after response
                if target == 'bridge':
                    self._execute_bridge_restart_after_response()
                
                return True, response
            else:
                available = ', '.join(self.reset_commands.keys())
                return True, f"❌ Unknown reset target: {target}\nAvailable: {available}"
                
        except Exception as e:
            return True, f"❌ Reset failed: {str(e)}"
    
    def _is_reset_command(self, message: str) -> bool:
        """Check if message is a reset command"""
        clean_msg = message.lower().strip()
        return clean_msg.startswith('!reset') or ' !reset' in clean_msg
    
    def _extract_reset_target(self, message: str) -> str:
        """Extract the reset target from the command"""
        # Remove mentions and normalize
        clean_msg = message.lower().strip()
        
        # Find !reset and extract target
        if '!reset' in clean_msg:
            parts = clean_msg.split('!reset', 1)[1].strip().split()
            if parts:
                return parts[0]
            else:
                return 'help'  # Default to help if no target specified
        
        return 'help'
    
    def _reset_all(self) -> str:
        """Full system reset - Claude Desktop, API, and Bridge services"""
        steps = []
        
        try:
            # Step 1: Kill any stray desktop-commander processes
            steps.append("🔍 Checking for stray desktop-commander processes...")
            self._kill_desktop_commander_processes()
            steps.append("✅ Desktop-commander processes cleaned")
            
            # Step 2: Stop bridge services
            steps.append("🛑 Stopping bridge services...")
            result = subprocess.run(['sudo', 'systemctl', 'stop', 'claude-bridge.target'], 
                                  capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                steps.append("✅ Bridge services stopped")
            else:
                steps.append(f"⚠️ Bridge stop warning: {result.stderr}")
            
            # Step 3: Restart Claude Desktop with debugging
            steps.append("🔄 Restarting Claude Desktop with debugging...")
            restart_result = self._restart_claude_desktop()
            steps.append(restart_result)
            
            # Step 4: Wait a moment for Claude to start
            steps.append("⏳ Waiting for Claude Desktop to initialize...")
            time.sleep(5)
            
            # Step 5: Start bridge services
            steps.append("🚀 Starting bridge services...")
            result = subprocess.run(['sudo', 'systemctl', 'start', 'claude-bridge.target'],
                                  capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                steps.append("✅ Bridge services started")
            else:
                steps.append(f"❌ Bridge start failed: {result.stderr}")
            
            steps.append("🎉 Full reset complete!")
            
        except Exception as e:
            steps.append(f"❌ Reset error: {str(e)}")
        
        return '\n'.join(steps)
    
    def _reset_claude(self) -> str:
        """Reset only Claude Desktop"""
        try:
            print("🔄 Executing Claude Desktop restart...")
            result = self._restart_claude_desktop()
            return f"🔄 **Claude Desktop Reset**\n{result}\n\n⏰ Claude Desktop restart completed. You may need to wait a moment for debugging to become active."
        except Exception as e:
            return f"❌ Claude reset failed: {str(e)}"
    
    def _reset_api(self) -> str:
        """Reset only the API service"""
        try:
            print("🔄 Executing API restart...")
            result = subprocess.run(['sudo', 'systemctl', 'restart', 'claude-bridge-api'],
                                  capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                # Check if the service is actually running
                status_result = subprocess.run(['sudo', 'systemctl', 'is-active', 'claude-bridge-api'],
                                             capture_output=True, text=True, timeout=10)
                if status_result.returncode == 0 and status_result.stdout.strip() == 'active':
                    return "✅ API service restarted successfully and is running"
                else:
                    return "⚠️ API restart command succeeded but service may not be active"
            else:
                return f"❌ API restart failed: {result.stderr.strip()}"
        except subprocess.TimeoutExpired:
            return "⏰ API restart timed out - service may still be starting"
        except Exception as e:
            return f"❌ API reset error: {str(e)}"
    
    def _reset_bridge(self) -> str:
        """Reset only the bridge service"""
        try:
            print("🔄 Executing bridge restart...")
            # Send response immediately before restarting (since restart will kill this process)
            return "🔄 Bridge service restart initiated - this will terminate the current process and start a new one. If you don't see further messages, the restart worked!"
        except Exception as e:
            return f"❌ Bridge reset error: {str(e)}"
    
    def _execute_bridge_restart_after_response(self) -> None:
        """Execute the actual bridge restart after sending response (called separately)"""
        try:
            import threading
            import time
            
            def delayed_restart():
                time.sleep(2)  # Give time for response to be sent
                subprocess.run(['sudo', 'systemctl', 'restart', 'claude-bridge'],
                             capture_output=True, text=True, timeout=30)
            
            restart_thread = threading.Thread(target=delayed_restart, daemon=True)
            restart_thread.start()
        except Exception as e:
            print(f"❌ Bridge restart execution error: {e}")
    
    def _reset_status(self) -> str:
        """Show system status without performing any resets"""
        try:
            # Check service status using process inspection instead of systemctl
            services_status = []
            
            # Check processes
            ps_result = subprocess.run(['ps', 'aux'], capture_output=True, text=True, timeout=5)
            ps_output = ps_result.stdout
            
            # Check API service
            api_running = 'npm run api' in ps_output
            api_status = "✅ Running" if api_running else "❌ Not running"
            services_status.append(f"• **API Service**: {api_status}")
            
            # Check Bridge service  
            bridge_running = 'npm run bridge' in ps_output
            bridge_status = "✅ Running" if bridge_running else "❌ Not running"
            services_status.append(f"• **Bridge Service**: {bridge_status}")
            
            # Check Claude Desktop process
            claude_running = 'claude' in ps_output.lower() and 'appimage' in ps_output.lower()
            claude_status = "✅ Running" if claude_running else "❌ Not running"
            services_status.append(f"• **Claude Desktop**: {claude_status}")
            
            # Check Chrome Debug Protocol
            try:
                import requests
                debug_response = requests.get('http://localhost:9223/json', timeout=3)
                debug_status = "✅ Accessible" if debug_response.status_code == 200 else "❌ Not accessible"
            except:
                debug_status = "❌ Not accessible"
            services_status.append(f"• **Debug Protocol**: {debug_status}")
            
            # Check API health endpoint
            try:
                import requests
                health_response = requests.get('http://localhost:3000/health', timeout=3)
                if health_response.status_code == 200:
                    health_data = health_response.json()
                    api_health = "✅ Healthy" if health_data.get('status') == 'healthy' else "⚠️ Unhealthy"
                else:
                    api_health = "❌ Not responding"
            except:
                api_health = "❌ Not responding"
            services_status.append(f"• **API Health**: {api_health}")
            
            status_message = "📊 **System Status Report**\n\n"
            status_message += "\n".join(services_status)
            status_message += f"\n\n🕐 **Check Time**: {time.strftime('%H:%M:%S')}"
            
            return status_message
            
        except Exception as e:
            return f"❌ Status check error: {str(e)}"
    
    def _reset_help(self) -> str:
        """Show help for reset commands"""
        return """🔧 **Manual Reset Commands**

Available reset targets:
• `!reset all` - Full reset: Claude Desktop + API + Bridge services
• `!reset claude` - Restart Claude Desktop with debugging only  
• `!reset api` - Restart API service only
• `!reset bridge` - Restart bridge service only
• `!reset status` - Show current system status
• `!reset help` - Show this help message

**Other Commands:**
• `!new` - Start a new conversation thread with Claude

**Usage:** `@claude-oum !<command>`

**Full Reset Sequence:**
1. Stop bridge services
2. Kill stray desktop-commander processes  
3. Restart Claude Desktop with debugging
4. Start bridge services

**Note:** These commands execute immediately and don't require Claude's involvement."""
    
    def _kill_desktop_commander_processes(self) -> None:
        """Kill any stray desktop-commander processes"""
        try:
            # Find desktop-commander processes
            result = subprocess.run(['ps', 'aux'], capture_output=True, text=True)
            if result.returncode == 0:
                lines = result.stdout.split('\n')
                for line in lines:
                    if 'desktop-commander' in line and 'grep' not in line:
                        # Extract PID (second column)
                        parts = line.split()
                        if len(parts) >= 2:
                            try:
                                pid = int(parts[1])
                                os.kill(pid, signal.SIGTERM)
                                print(f"🔫 Killed desktop-commander PID {pid}")
                            except (ValueError, ProcessLookupError):
                                pass  # Process already gone or invalid PID
        except Exception as e:
            print(f"⚠️ Warning killing desktop-commander processes: {e}")
    
    def _restart_claude_desktop(self) -> str:
        """Restart Claude Desktop using the restart script"""
        try:
            # Look for restart script in the project directory
            current_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            script_path = os.path.join(current_dir, "restart_claude_with_debugging.sh")
            
            if not os.path.exists(script_path):
                return f"❌ Restart script not found at {script_path}"
            
            
            if not os.path.exists(script_path):
                return f"❌ Restart script not found: {script_path}"
            
            # Execute the restart script
            result = subprocess.run(['bash', script_path], 
                                  capture_output=True, text=True, timeout=60)
            
            if result.returncode == 0:
                # Parse the output for key information
                output = result.stdout
                if "Chrome DevTools Protocol active" in output:
                    return "✅ Claude Desktop restarted with debugging active"
                elif "Claude launched with PID" in output:
                    return "✅ Claude Desktop restarted (debugging starting...)"
                else:
                    return f"✅ Claude Desktop restarted\n{output[-200:]}"  # Last 200 chars
            else:
                return f"❌ Claude restart failed: {result.stderr}"
                
        except subprocess.TimeoutExpired:
            return "⏰ Claude restart timeout (may still be starting...)"
        except Exception as e:
            return f"❌ Claude restart error: {str(e)}"
