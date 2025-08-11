# Claude Mattermost Bridge Services

This directory contains systemd service files for managing the Claude Mattermost Bridge components.

## Services

- `claude-bridge-api.service` - API service that communicates with Claude Desktop
- `claude-bridge.service` - Bridge service that connects to Mattermost
- `claude-bridge.target` - Target for managing both services together

## Installation

Run the install script with sudo:

```bash
sudo ./install-services.sh
```

This creates symlinks in `/etc/systemd/system/` and runs `systemctl daemon-reload`.

## Usage

Start both services:
```bash
sudo systemctl start claude-bridge.target
```

Stop both services:
```bash
sudo systemctl stop claude-bridge.target
```

Check status:
```bash
sudo systemctl status claude-bridge-api
sudo systemctl status claude-bridge
```

View logs:
```bash
sudo journalctl -f -u claude-bridge-api
sudo journalctl -f -u claude-bridge
```

## Sudoers Configuration

To allow non-root management, run:
```bash
sudo visudo /etc/sudoers.d/claude-bridge
```

And add:
```
%ben ALL= NOPASSWD: /bin/systemctl start claude-bridge*
%ben ALL= NOPASSWD: /bin/systemctl restart claude-bridge*
%ben ALL= NOPASSWD: /bin/systemctl stop claude-bridge*
%ben ALL= NOPASSWD: /bin/systemctl status claude-bridge*
%ben ALL= NOPASSWD: /bin/journalctl -f -u claude-bridge*
```

## Manual Reset Command

The bridge will recognize `@claude-oum !reset [all|claude|api|bridge]` commands:

- `!reset all` - Full reset: kill desktop-commander processes, restart Claude Desktop with debugging, restart both services
- `!reset claude` - Restart Claude Desktop with debugging only
- `!reset api` - Restart API service only  
- `!reset bridge` - Restart bridge service only

## Notes

- Services log to journald with identifiers `claude-bridge-api` and `claude-bridge`
- Both services restart automatically on failure with 5-second delay
- Bridge service depends on API service (will start API if needed)
- The target allows managing both services as a unit
