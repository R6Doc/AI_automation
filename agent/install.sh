#!/bin/bash
# Installs the Match Generator agent on the designer's Mac and starts it at every login.
# Usage: ./install.sh https://your-dashboard.vercel.app [path/to/template.ai]
set -euo pipefail

DASHBOARD_URL="${1:-}"
TEMPLATE="${2:-}"
INSTALL_DIR="$HOME/MatchGenerator"
LABEL="com.matchgenerator.agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/MatchGenerator.log"
SRC="$(cd "$(dirname "$0")" && pwd)"

if [[ -z "$DASHBOARD_URL" ]]; then
  echo "Usage: ./install.sh https://your-dashboard.vercel.app [path/to/template.ai]"
  exit 1
fi
DASHBOARD_URL="${DASHBOARD_URL%/}"

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "Node.js is not installed. Install it from https://nodejs.org (LTS) and run this again."
  exit 1
fi

echo "→ Installing to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/illustrator" "$INSTALL_DIR/template" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$SRC/server.js" "$INSTALL_DIR/"
cp "$SRC/illustrator/"*.jsx "$INSTALL_DIR/illustrator/"

if [[ ! -f "$INSTALL_DIR/config.json" ]]; then
  sed "s#https://YOUR-PROJECT.vercel.app#$DASHBOARD_URL#" "$SRC/config.example.json" > "$INSTALL_DIR/config.json"
  echo "→ Created config.json for $DASHBOARD_URL"
else
  echo "→ Kept existing config.json"
fi

if [[ -n "$TEMPLATE" ]]; then
  cp "$TEMPLATE" "$INSTALL_DIR/template/template.ai"
  echo "→ Copied template"
elif [[ ! -f "$INSTALL_DIR/template/template.ai" ]]; then
  echo "! No template yet: copy the prepared template to $INSTALL_DIR/template/template.ai"
fi

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$INSTALL_DIR/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>$INSTALL_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

sleep 1
if curl -fsS "http://127.0.0.1:3030/health" >/dev/null; then
  echo "✓ Agent is running. Logs: $LOG"
else
  echo "! Agent didn't respond yet. Check the log: $LOG"
fi
