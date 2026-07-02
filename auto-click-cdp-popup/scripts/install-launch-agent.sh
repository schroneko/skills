#!/usr/bin/env bash
set -euo pipefail

label="com.schroneko.auto-click-cdp-popup"
plist_path="$HOME/Library/LaunchAgents/$label.plist"
log_dir="$HOME/Library/Logs/auto-click-cdp-popup"
skill_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_path="$skill_dir/scripts/auto-click-cdp-popup.swift"
app_path="$HOME/Applications/AutoClickCDPPopup.app"
watcher_path="$app_path/Contents/MacOS/auto-click-cdp-popup"

mkdir -p "$HOME/Library/LaunchAgents" "$log_dir" "$app_path/Contents/MacOS" "$app_path/Contents/Resources"
if [ ! -x "$watcher_path" ] || [ "$source_path" -nt "$watcher_path" ]; then
  swiftc "$source_path" -o "$watcher_path"
  rebuilt=1
else
  rebuilt=0
fi
cat >"$app_path/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>Auto Click CDP Popup</string>
  <key>CFBundleExecutable</key>
  <string>auto-click-cdp-popup</string>
  <key>CFBundleIdentifier</key>
  <string>$label</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Auto Click CDP Popup</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
PLIST
signing_identity="${AUTO_CLICK_SIGNING_IDENTITY:-NiceVoice}"
if [ "$rebuilt" -eq 1 ]; then
  if security find-identity -v -p codesigning | fgrep -q "\"$signing_identity\""; then
    codesign --force --deep --sign "$signing_identity" --identifier "$label" "$app_path" >/dev/null
    echo "note: signed with stable identity \"$signing_identity\"; existing Accessibility grant stays valid across rebuilds"
  else
    codesign --force --deep --sign - --identifier "$label" "$app_path" >/dev/null
    echo "note: ad-hoc signed; re-add AutoClickCDPPopup.app in System Settings > Privacy & Security > Accessibility (remove the row, then add it again)"
  fi
fi

if launchctl print "gui/$UID/$label" >/dev/null 2>&1; then
  launchctl bootout "gui/$UID" "$plist_path" >/dev/null 2>&1 || true
fi

cat >"$plist_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-gj</string>
    <string>$app_path</string>
    <string>--args</string>
    <string>--interval</string>
    <string>0.5</string>
    <string>--log</string>
    <string>$log_dir/actions.log</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$log_dir/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>$log_dir/stderr.log</string>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
PLIST

plutil -lint "$plist_path"
launchctl bootstrap "gui/$UID" "$plist_path"
launchctl enable "gui/$UID/$label"
launchctl kickstart -k "gui/$UID/$label"
launchctl print "gui/$UID/$label"
