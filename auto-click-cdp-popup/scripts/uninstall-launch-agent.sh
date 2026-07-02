#!/usr/bin/env bash
set -euo pipefail

label="com.schroneko.auto-click-cdp-popup"
plist_path="$HOME/Library/LaunchAgents/$label.plist"

if launchctl print "gui/$UID/$label" >/dev/null 2>&1; then
  launchctl bootout "gui/$UID" "$plist_path"
fi

rm -f "$plist_path"
rm -f "$HOME/Library/Application Support/$label/auto-click-cdp-popup"
