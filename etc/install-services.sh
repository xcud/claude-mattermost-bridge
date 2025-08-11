#!/usr/bin/env bash

# Claude Desktop Bridge - Systemd Service Installation Script
#
# This script creates SYMLINKS from /etc/systemd/system/ to your project directory.
# IMPORTANT: Changes to service files in your project will immediately affect systemd!
#
# The script:
# 1. Generates personalized service files from templates
# 2. Creates symlinks from /etc/systemd/system/ to your project's etc/ directory  
# 3. Reloads systemd daemon
#
# WARNING: If you modify service files after installation, run:
#   sudo systemctl daemon-reload
#   sudo systemctl restart claude-bridge.target

if [ "$EUID" -ne 0 ]; then
	echo "Please run this script with sudo."
	echo ""
	echo "This script needs root access to:"
	echo "  - Create symlinks in /etc/systemd/system/"
	echo "  - Reload systemd daemon"
	exit 1
fi

# Get the current directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_ETC_DIR="$SCRIPT_DIR"
SYSTEMD_DIR="/etc/systemd/system"

echo "🔧 Claude Desktop Bridge - Systemd Installation"
echo "================================================"
echo "Project directory: $(dirname "$BRIDGE_ETC_DIR")"
echo "Service files: $BRIDGE_ETC_DIR"
echo ""
echo "⚠️  IMPORTANT: This creates SYMLINKS to your project directory!"
echo "   Changes to service files will immediately affect systemd."
echo ""

# Function to create personalized service file from template
create_service_from_template() {
    local service_name="$1"
    local template_file="${BRIDGE_ETC_DIR}/${service_name}.template"
    local service_file="${BRIDGE_ETC_DIR}/${service_name}"
    
    if [ ! -f "$template_file" ]; then
        echo "ERROR: Template file not found: $template_file"
        exit 1
    fi
    
    echo "Creating $service_name from template..."
    
    # Get current user and project directory
    local current_user="$SUDO_USER"
    local project_dir="$(dirname "$BRIDGE_ETC_DIR")"
    
    # Replace placeholders in template
    sed -e "s|/path/to/claude-mattermost-bridge|$project_dir|g" \
        -e "s|your-username|$current_user|g" \
        "$template_file" > "$service_file"
    
    echo "  ✅ Created $service_file"
}

# Create service files from templates
create_service_from_template "claude-bridge-api.service"
create_service_from_template "claude-bridge.service"

echo ""
echo "📝 Creating symlinks to systemd (these link to your project directory)..."

link_service() {
	local service_name="$1"
	local source_file="$BRIDGE_ETC_DIR/$service_name"
	local target_link="$SYSTEMD_DIR/$service_name"
	
	if [ -L "$target_link" ]; then
		echo "  ⚠️  Replacing existing symlink: $service_name"
		sudo rm "$target_link"
	elif [ -f "$target_link" ]; then
		echo "  ⚠️  Backing up existing file: $service_name"
		sudo mv "$target_link" "${target_link}.backup"
	fi
	
	sudo ln -sf "$source_file" "$target_link"
	echo "  🔗 Symlinked $service_name"
	echo "     $target_link -> $source_file"
}

link_service "claude-bridge-api.service"
link_service "claude-bridge.service"
link_service "claude-bridge.target"

echo ""
echo "🔄 Reloading systemd daemon..."
sudo systemctl daemon-reload

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Service Management Commands:"
echo "  sudo systemctl start claude-bridge.target     # Start both services"
echo "  sudo systemctl stop claude-bridge.target      # Stop both services"
echo "  sudo systemctl restart claude-bridge.target   # Restart both services"
echo "  sudo systemctl status claude-bridge-api       # Check API status"
echo "  sudo systemctl status claude-bridge           # Check bridge status"
echo ""
echo "⚠️  REMEMBER: Service files are symlinked to your project!"
echo "   - Editing files in $BRIDGE_ETC_DIR affects systemd immediately"
echo "   - After editing service files, run: sudo systemctl daemon-reload"
echo "   - Then restart services: sudo systemctl restart claude-bridge.target"
