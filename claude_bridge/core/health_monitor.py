"""
Health Monitor and Reconnection System
Monitors component health and handles automatic reconnection
"""

import os
import time
import threading
import requests
import subprocess
from typing import Dict, Any, Optional, Callable
from datetime import datetime, timedelta


class HealthMonitor:
    """Monitors health of all bridge components and handles reconnection"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.api_url = config.get('api_url', 'http://localhost:3000')
        self.check_interval = config.get('health_check_interval', 30)  # seconds
        self.reconnect_attempts = config.get('max_reconnect_attempts', 3)
        self.reconnect_delay = config.get('reconnect_delay', 5)  # seconds
        
        # Health state tracking
        self.component_status = {
            'claude_desktop': {'healthy': False, 'last_check': None, 'consecutive_failures': 0},
            'api_server': {'healthy': False, 'last_check': None, 'consecutive_failures': 0},
            'bridge_connection': {'healthy': False, 'last_check': None, 'consecutive_failures': 0}
        }
        
        # Monitor thread control
        self.monitoring = False
        self.monitor_thread = None
        
        # Callbacks for health changes
        self.health_change_callbacks = []
        
    def add_health_change_callback(self, callback: Callable[[str, bool, Dict], None]):
        """Add callback for health state changes"""
        self.health_change_callbacks.append(callback)
    
    def start_monitoring(self):
        """Start health monitoring in background thread"""
        if self.monitoring:
            return
            
        self.monitoring = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        print("🏥 Health monitoring started")
    
    def stop_monitoring(self):
        """Stop health monitoring"""
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5)
        print("🏥 Health monitoring stopped")
    
    def _monitor_loop(self):
        """Main monitoring loop"""
        while self.monitoring:
            try:
                # Check all components
                self._check_api_server_health()
                self._check_claude_desktop_health()
                self._check_bridge_connection_health()
                
                # Handle any unhealthy components
                self._handle_unhealthy_components()
                
                time.sleep(self.check_interval)
                
            except Exception as e:
                print(f"❌ Health monitor error: {e}")
                time.sleep(self.check_interval)
    
    def _check_api_server_health(self) -> bool:
        """Check if API server is healthy"""
        component = 'api_server'
        try:
            response = requests.get(f"{self.api_url}/health", timeout=5)
            
            if response.status_code == 200:
                result = response.json()
                is_healthy = result.get('status') == 'healthy'
                
                self._update_component_status(component, is_healthy)
                return is_healthy
            else:
                self._update_component_status(component, False)
                return False
                
        except Exception as e:
            print(f"❌ API server health check failed: {e}")
            self._update_component_status(component, False)
            return False
    
    def _check_claude_desktop_health(self) -> bool:
        """Check if Claude Desktop is running and accessible"""
        component = 'claude_desktop'
        try:
            # Check if Claude Desktop process is running
            result = subprocess.run(['ps', 'aux'], capture_output=True, text=True)
            claude_running = 'claude' in result.stdout.lower() and 'appimage' in result.stdout.lower()
            
            if not claude_running:
                self._update_component_status(component, False)
                return False
            
            # Check if Chrome Debug Protocol is accessible
            try:
                debug_response = requests.get('http://localhost:9223/json', timeout=3)
                debug_accessible = debug_response.status_code == 200
            except:
                debug_accessible = False
            
            is_healthy = claude_running and debug_accessible
            self._update_component_status(component, is_healthy)
            return is_healthy
            
        except Exception as e:
            print(f"❌ Claude Desktop health check failed: {e}")
            self._update_component_status(component, False)
            return False
    
    def _check_bridge_connection_health(self) -> bool:
        """Check if bridge can successfully communicate with API"""
        component = 'bridge_connection'
        try:
            # Simply check if the API server is responding to health checks
            # This is sufficient to verify the connection without sending test messages
            response = requests.get(f"{self.api_url}/health", timeout=5)
            
            is_healthy = response.status_code == 200
            self._update_component_status(component, is_healthy)
            return is_healthy
            
        except Exception as e:
            print(f"❌ Bridge connection health check failed: {e}")
            self._update_component_status(component, False)
            return False
    
    def _update_component_status(self, component: str, is_healthy: bool):
        """Update component health status and track failures"""
        status = self.component_status[component]
        previous_health = status['healthy']
        
        status['last_check'] = datetime.now()
        
        if is_healthy:
            status['healthy'] = True
            status['consecutive_failures'] = 0
            
            # Notify if this is a recovery
            if not previous_health:
                print(f"✅ {component} recovered")
                self._notify_health_change(component, True, status)
        else:
            status['healthy'] = False
            status['consecutive_failures'] += 1
            
            # Notify if this is a new failure
            if previous_health:
                print(f"❌ {component} became unhealthy")
                self._notify_health_change(component, False, status)
    
    def _notify_health_change(self, component: str, is_healthy: bool, status: Dict):
        """Notify registered callbacks of health changes"""
        for callback in self.health_change_callbacks:
            try:
                callback(component, is_healthy, status)
            except Exception as e:
                print(f"❌ Health change callback error: {e}")
    
    def _handle_unhealthy_components(self):
        """Handle components that are unhealthy"""
        for component, status in self.component_status.items():
            if not status['healthy'] and status['consecutive_failures'] >= 2:
                # ONLY auto-recover API server and bridge connection
                # Claude Desktop restarts must be manual to prevent loops
                if component != 'claude_desktop':
                    self._attempt_component_recovery(component, status)
                else:
                    # Just log Claude Desktop issues without auto-restart
                    if status['consecutive_failures'] == 2:  # Only log once
                        print(f"⚠️ {component} unhealthy (manual restart required via !reset claude)")

    
    def _attempt_component_recovery(self, component: str, status: Dict):
        """Attempt to recover an unhealthy component"""
        if status['consecutive_failures'] > self.reconnect_attempts:
            print(f"⚠️ {component} exceeded max reconnect attempts, skipping")
            return
        
        print(f"🔄 Attempting to recover {component}...")
        
        try:
            if component == 'claude_desktop':
                self._recover_claude_desktop()
            elif component == 'api_server':
                self._recover_api_server()
            elif component == 'bridge_connection':
                self._recover_bridge_connection()
                
        except Exception as e:
            print(f"❌ Recovery attempt failed for {component}: {e}")
    
    def _recover_claude_desktop(self):
        """Attempt to recover Claude Desktop"""
        print("🔄 Restarting Claude Desktop...")
        # Look for restart script in the project directory
        current_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        script_path = os.path.join(current_dir, "restart_claude_with_debugging.sh")
        
        if not os.path.exists(script_path):
            print(f"❌ Restart script not found at {script_path}")
            return False
        
        result = subprocess.run(['bash', script_path], 
                              capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            print("✅ Claude Desktop restart initiated")
            time.sleep(10)  # Give Claude time to start
        else:
            print(f"❌ Claude Desktop restart failed: {result.stderr}")
    
    def _recover_api_server(self):
        """Attempt to recover API server"""
        print("🔄 Restarting API server...")
        
        # Restart API service
        result = subprocess.run(['sudo', 'systemctl', 'restart', 'claude-bridge-api'],
                              capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            print("✅ API server restart initiated")
            time.sleep(5)  # Give API time to start
        else:
            print(f"❌ API server restart failed: {result.stderr}")
    
    def _recover_bridge_connection(self):
        """Attempt to recover bridge connection"""
        print("🔄 Attempting bridge connection recovery...")
        
        # Try reinitializing API connection
        try:
            response = requests.post(f"{self.api_url}/claude/initialize", timeout=10)
            if response.status_code == 200:
                print("✅ Bridge connection recovery initiated")
            else:
                print(f"❌ Bridge connection recovery failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Bridge connection recovery error: {e}")
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get current health status of all components"""
        return {
            'overall_healthy': all(status['healthy'] for status in self.component_status.values()),
            'components': dict(self.component_status),
            'last_check': datetime.now().isoformat()
        }
    
    def force_health_check(self) -> Dict[str, bool]:
        """Force immediate health check of all components"""
        results = {
            'api_server': self._check_api_server_health(),
            'claude_desktop': self._check_claude_desktop_health(),
            'bridge_connection': self._check_bridge_connection_health()
        }
        
        print(f"🏥 Health check results: {results}")
        return results
