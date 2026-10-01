#!/bin/bash
# Stops the agent and removes it from login items. Leaves ~/MatchGenerator (config + template) in place.
LABEL="com.matchgenerator.agent"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "Agent stopped and removed. Delete ~/MatchGenerator to remove its files."
