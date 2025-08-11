# 🌉 Claude Desktop Bridge

**Production-Ready Multi-Platform Communication System with Real-Time Streaming**

Seamless bidirectional communication between Claude Desktop and multiple platforms (Mattermost, Terminal, Web) with real-time streaming responses and modular plugin architecture.

## 🎯 What This Accomplishes

**📱 Platform → 🤖 Claude Desktop → 📡 Bridge → 📱 Platform (Real-Time)**

- **Send messages to Claude Desktop from any platform** via mentions/commands
- **Real-time streaming responses** - see Claude typing as it responds  
- **Standalone messages** - clean conversation flow without reply threading
- **Zero window focus required** - operates completely in background
- **Multi-platform architecture** - easy to add new interfaces

## ⚡ Quick Start

### 1. Prerequisites
- Claude Desktop running with debugging enabled
- Platform accounts (Mattermost server, terminal access, etc.)
- Node.js and Python 3 installed

### 2. Configure Environment Variables
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your actual values
nano .env
```

**Required Configuration**:
- `MATTERMOST_URL` - Your Mattermost server URL
- `MATTERMOST_BOT_TOKEN` - Bot access token from Mattermost
- `MATTERMOST_BOT_USER_ID` - Bot user ID from Mattermost  
- `MATTERMOST_TEAM_ID` - Team ID where the bot operates

See [Configuration Guide](#configuration) below for detailed setup instructions.

### 3. Install Dependencies
```bash
npm install
pip install -r requirements.txt
```

### 4. Setup Claude Desktop Debug Mode
```bash
./restart_claude_with_debugging.sh
```
**Important**: Run this after every Claude Desktop restart

### 4. Start the Bridge System

#### Option A: Development Mode (Auto-Restart) ⭐ **Recommended**
```bash
# Terminal 1: Start API server with auto-restart
npm run api

# Terminal 2: Start bridge with auto-restart
npm run bridge:mattermost
```

#### Option B: Manual Mode
```bash
# Terminal 1: API Server
node claude_api_server.js

# Terminal 2: Platform Bridge (choose one)
python3 -m claude_bridge.interfaces.mattermost  # Mattermost
python3 -m claude_bridge.interfaces.terminal    # Terminal (coming soon)
python3 -m claude_bridge.interfaces.webapp      # Web interface (coming soon)
```

### 5. Test the Bridge
**Mattermost**: `@claude-oum Hello! This is a test message`
**Terminal**: `> Hello! This is a test message` (coming soon)

You should see the response appear and build in real-time!

## 🏗️ Architecture Overview

### 🔄 **Streaming Architecture (NEW!)**
- **Real-time responses** - see Claude typing as it generates content
- **Progressive message updates** - single message that grows in real-time
- **Platform-specific handling** - Mattermost edits same message, terminal streams output
- **No more waiting** - immediate feedback for responsive UX

### 🧩 **Modular Plugin System**
```
Claude Desktop Bridge
├── Core Bridge (claude_bridge/core/)
│   ├── bridge_core.py        # Universal coordination logic
│   ├── message_processing.py # Platform-agnostic formatting
│   └── claude_api.py         # Claude Desktop communication
├── Platform Interfaces (claude_bridge/interfaces/)
│   ├── mattermost.py         # Mattermost integration ✅
│   ├── terminal.py           # Terminal interface (planned)
│   └── webapp.py             # Web interface (planned)
└── API Server
    └── claude_api_server.js   # Claude Desktop automation server
```

### 🔧 **Dual Process Architecture**
- **`claude_api_server.js`** - Node.js API server for Claude Desktop automation
- **Platform bridges** - Python interfaces for different communication methods
- **WebSocket streaming** - Real-time bidirectional communication
- **Auto-restart development** with hot-reloading

## 🌊 Real-Time Streaming Features

### ✨ **What You'll See**
- **Immediate response start** - message appears within seconds
- **Progressive building** - content grows as Claude generates it
- **Single message history** - no spam, clean conversation
- **Natural conversation flow** - feels like chatting with a team member

### 🎛️ **Technical Implementation**
- **WebSocket content updates** - real-time content streaming from Claude
- **Platform-specific delivery** - Mattermost edits messages, terminal streams
- **Smart completion detection** - waits for Claude's "Stop response" button to disappear
- **Robust error handling** - graceful fallbacks and timeout management

## 🚀 Current Status & Capabilities

### ✅ **Production Ready (August 9, 2025)**
- **Mattermost Integration** - Full bidirectional communication with streaming
- **Completion Detection** - Robust DOM-based response completion
- **Real-time Streaming** - Progressive message updates
- **Standalone Posts** - Clean conversation flow without reply threading
- **Multi-channel Support** - Works across different Mattermost channels

### 🎯 **Key Achievements**
- **Functional parity** with original proof of concept
- **Clean modular architecture** - evolved from monolithic design
- **Production-grade reliability** - comprehensive error handling
- **Superior UX** - real-time streaming vs. batch responses

## 🛣️ Roadmap & Next Steps

### 🔥 **Immediate Priorities**

#### **1. Pure WebSocket Streaming** 
- Eliminate polling fallback (WebSocket works perfectly)
- Optimize for pure streaming architecture
- Reduce latency and resource usage

#### **2. Multi-Platform Expansion**
```bash
# Terminal Interface
python3 -m claude_bridge.interfaces.terminal
> Hello Claude, how are you today?

# Web Interface  
python3 -m claude_bridge.interfaces.webapp
# Access via http://localhost:8080
```

#### **3. Enhanced Threading & Context Management**
- **New message threads** - create fresh Claude contexts per message
- **Curated context injection** - maintain conversation continuity
- **Context size management** - intelligent pruning for unlimited conversations

### 🔮 **Future Enhancements**

#### **4. Advanced Plugin Architecture**
- **Multiple simultaneous interfaces** - run terminal AND Mattermost AND web together
- **Plugin system** - easy addition of new platforms
- **Shared state management** - conversations across platforms

#### **5. Production Deployment**
- **Install on `jupiter` server** - production environment setup
- **Docker containerization** - easy deployment and scaling  
- **Configuration management** - environment-specific settings

#### **6. Advanced Features**
- **Message history** - persistent conversation tracking
- **User preferences** - per-user customization
- **Rate limiting** - intelligent request management
- **Analytics** - usage metrics and insights

### 🧹 **Code Quality Improvements**
- **Continued refactoring** - maintain clean architecture
- **Test coverage** - comprehensive testing suite
- **Documentation** - detailed API and plugin guides
- **Performance optimization** - latency and resource improvements

## 📊 Performance Metrics

### 🚀 **Current Performance**
- **Response Time**: ~2-5 seconds end-to-end with streaming
- **First Content**: <3 seconds (immediate feedback)
- **Streaming Updates**: Real-time (sub-second updates)
- **Completion Detection**: Immediate upon Claude finish
- **Reliability**: Production-ready with robust error handling

### 📈 **Improvements Over Original**
- **~70% faster perceived response time** (streaming vs. batch)
- **Clean conversation UX** (standalone posts vs. reply threads)
- **Modular architecture** (plugins vs. monolith)
- **Production reliability** (error handling vs. proof of concept)

## ⚙️ Configuration

### Environment Variables (`.env`)
```bash
# Claude Desktop Settings
CLAUDE_DEBUG_PORT=9223
API_URL=http://localhost:3000

# Mattermost Configuration
MATTERMOST_URL="https://your-mattermost-server.com"
BOT_TOKEN="your-bot-token-here"
BOT_USER_ID="your-bot-user-id"
TEAM_ID="your-team-id"

# Bridge Settings
STREAMING_ENABLED=true
POLL_INTERVAL=3
RESPONSE_TIMEOUT=180
```

## 🔍 Monitoring and Debugging

### 📺 **Real-Time Logs**
```
🌊 STREAMING TEST: Real-time incremental updates!
📥 WebSocket content update: 150 chars (complete: false)
📥 WebSocket content update: 400 chars (complete: false)  
📥 WebSocket content update: 800 chars (complete: false)
📤 Sending COMPLETE response: 1200 chars
✅ Message updated in Mattermost (ID: abc123)
✅ Loop exited due to COMPLETION after 8.5s
```

### 🎯 **Success Indicators**
- ✅ **Streaming start**: "📥 WebSocket content update"
- ✅ **Real-time updates**: Progressive character counts
- ✅ **Message editing**: "Message updated in Mattermost"
- ✅ **Clean completion**: "Loop exited due to COMPLETION"

## 🏆 Major Milestones Achieved

### 🎯 **August 9, 2025 - Production Streaming Release**
- ✅ **Real-time streaming responses** - revolutionary UX improvement
- ✅ **Standalone message posts** - clean conversation flow
- ✅ **Modular plugin architecture** - evolved from monolithic proof of concept
- ✅ **Production reliability** - comprehensive error handling and logging
- ✅ **Multi-channel support** - works across different Mattermost channels

### 🚀 **Key Breakthrough**
**From 15-20 second batch responses → Real-time streaming with immediate feedback**

This represents a **major advancement in AI-human collaboration**:
- Eliminates waiting periods for long responses
- Creates natural conversation flow in team channels
- Provides immediate feedback for better user experience
- Maintains clean, professional presentation

---

## ⚙️ Configuration

### Mattermost Setup

1. **Create a Bot Account**:
   - Go to your Mattermost server → System Console → Integrations → Bot Accounts
   - Click "Add Bot Account"
   - Set username (e.g., "claude-bot") and display name
   - Save and copy the **Bot Access Token**

2. **Get Bot User ID**:
   ```bash
   curl -H "Authorization: Bearer YOUR_BOT_TOKEN" \
        https://your-mattermost.com/api/v4/users/me
   ```
   Copy the `id` field from the response.

3. **Get Team ID**:
   ```bash
   curl -H "Authorization: Bearer YOUR_BOT_TOKEN" \
        https://your-mattermost.com/api/v4/users/me/teams
   ```
   Copy the `id` field for your target team.

4. **Update Environment Variables**:
   Edit your `.env` file with the obtained values:
   ```env
   MATTERMOST_URL=https://your-mattermost.com
   MATTERMOST_BOT_TOKEN=your_bot_token_here
   MATTERMOST_BOT_USER_ID=your_bot_user_id_here
   MATTERMOST_TEAM_ID=your_team_id_here
   ```

### Additional Configuration Options

- **Custom Mention Patterns**: Set `MATTERMOST_MENTION_PATTERNS=@claude,@bot,@ai`
- **API Server Port**: Set `CLAUDE_API_URL=http://localhost:3001` for custom port
- **Polling Intervals**: Adjust `MONITORING_INTERVAL` and `MAX_RESPONSE_WAIT`

---

## 🏭 Production Deployment

### Systemd Service Installation

For production environments, install the bridge as systemd services for automatic startup and management:

```bash
# Install services (creates symlinks to your project directory)
sudo ./etc/install-services.sh
```

**⚠️ Important: Service Symlink Behavior**

The installation script creates **symlinks** from `/etc/systemd/system/` to your project's `etc/` directory:
- `/etc/systemd/system/claude-bridge.service` → `/path/to/your/project/etc/claude-bridge.service`
- `/etc/systemd/system/claude-bridge-api.service` → `/path/to/your/project/etc/claude-bridge-api.service`

This means:
- ✅ **Editing service files in your project immediately affects systemd**
- ⚠️ **After editing service files, run: `sudo systemctl daemon-reload`**
- 🔄 **Then restart services: `sudo systemctl restart claude-bridge.target`**

### Service Management

```bash
# Start all bridge services
sudo systemctl start claude-bridge.target

# Stop all bridge services  
sudo systemctl stop claude-bridge.target

# Restart after configuration changes
sudo systemctl restart claude-bridge.target

# Check service status
sudo systemctl status claude-bridge-api
sudo systemctl status claude-bridge

# View real-time logs
sudo journalctl -f -u claude-bridge-api
sudo journalctl -f -u claude-bridge
```

### Environment Configuration

Services automatically load environment variables from your `.env` file:
- Make sure `.env` is properly configured before starting services
- Changes to `.env` require service restart to take effect
- Logs will show clear error messages for missing environment variables

### Service Auto-Start

Enable services to start automatically on boot:
```bash
sudo systemctl enable claude-bridge.target
```

---

## 🛠️ Development Notes

### Project Structure
```
claude-mattermost-bridge/
├── src/                                 # Core extraction and automation
│   ├── simple-extraction.js            # Proven extraction logic  
│   ├── websocket-extractor.js          # Real-time content monitoring
│   └── claude_desktop_interface.js     # Claude Desktop automation
├── claude_bridge/                       # Main bridge system
│   ├── core/                           # Platform-agnostic logic
│   │   ├── bridge_core.py              # Universal coordination
│   │   ├── message_processing.py       # Content formatting
│   │   └── claude_api.py               # Claude Desktop communication
│   └── interfaces/                     # Platform-specific implementations
│       ├── mattermost.py               # Mattermost integration ✅
│       ├── terminal.py                 # Terminal interface (planned)
│       └── webapp.py                   # Web interface (planned)
├── claude_api_server.js                # Node.js automation server
└── tests/                              # Testing and validation
```

### Technology Stack
- **Python 3**: Modular bridge system with async/await
- **Node.js**: Claude Desktop automation and WebSocket extraction  
- **Chrome DevTools Protocol**: Claude Desktop debugging interface
- **Platform APIs**: Mattermost, Terminal, Web interfaces
- **WebSocket**: Real-time bidirectional communication

### Key Innovations
- **Real-time streaming architecture** - progressive message building
- **Platform-agnostic core** - easy addition of new interfaces
- **Robust completion detection** - "Stop response" button monitoring
- **Clean conversation UX** - standalone posts without threading

*Last Updated: August 9, 2025 - Real-Time Streaming Production Release*