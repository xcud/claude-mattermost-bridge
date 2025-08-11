#!/bin/bash
# Restart the real Claude Desktop with debugging enabled

LOG_FILE="/tmp/claude_restart.log"

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting Claude Desktop restart with debugging..."

# Find current Claude processes
CLAUDE_PIDS=$(ps aux | grep -E "claude.*\.AppImage|electron.*claude" | grep -v grep | grep -v "debug-profile" | awk '{print $2}')

if [ -n "$CLAUDE_PIDS" ]; then
    log "Found existing Claude processes: $CLAUDE_PIDS"
    log "Killing existing Claude processes..."
    for pid in $CLAUDE_PIDS; do
        log "Killing PID $pid"
        kill "$pid" 2>/dev/null
    done
    
    # Wait for processes to terminate
    sleep 3
    
    # Force kill if still running
    for pid in $CLAUDE_PIDS; do
        if kill -0 "$pid" 2>/dev/null; then
            log "Force killing PID $pid"
            kill -9 "$pid" 2>/dev/null
        fi
    done
else
    log "No existing Claude processes found"
fi

# Wait a bit more for cleanup
sleep 2

# Launch Claude with debugging enabled
# Set CLAUDE_PATH environment variable to your Claude installation
CLAUDE_PATH="${CLAUDE_PATH:-$HOME/Applications/claude-desktop*.AppImage}"

# Try to find Claude AppImage if not explicitly set
if [ ! -f "$CLAUDE_PATH" ]; then
    # Look for Claude AppImage in common locations
    for possible_path in \
        "$HOME/Applications/claude-desktop"*.AppImage \
        "$HOME/Downloads/claude-desktop"*.AppImage \
        "/opt/claude-desktop"*.AppImage \
        "/usr/local/bin/claude-desktop"*.AppImage; do
        if [ -f "$possible_path" ]; then
            CLAUDE_PATH="$possible_path"
            break
        fi
    done
fi

if [ ! -f "$CLAUDE_PATH" ]; then
    log "ERROR: Claude AppImage not found. Please set CLAUDE_PATH environment variable."
    log "Example: export CLAUDE_PATH=/path/to/claude-desktop.AppImage"
    exit 1
fi

log "Launching Claude with debugging on port 9223..."

# Use a different port to avoid conflicts with the debug launcher
DISPLAY=:1 "$CLAUDE_PATH" \
    --remote-debugging-port=9223 \
    --enable-logging \
    --disable-web-security \
    --disable-features=VizDisplayCompositor &

CLAUDE_PID=$!
log "Claude launched with PID $CLAUDE_PID on debugging port 9223"

# Wait for Claude to start
sleep 5

# Check if debugging port is active
if curl -s "http://localhost:9223/json" >/dev/null 2>&1; then
    log "SUCCESS: Chrome DevTools Protocol active on port 9223"
    curl -s "http://localhost:9223/json" | python3 -m json.tool > /tmp/claude_debug_pages.json
    log "Available pages saved to /tmp/claude_debug_pages.json"
else
    log "WARNING: Chrome DevTools Protocol not yet available on port 9223"
    log "This might be normal - Claude may need time to fully load"
fi

log "Claude Desktop restart completed. Check port 9223 for debugging."
