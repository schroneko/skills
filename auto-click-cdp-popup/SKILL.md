---
name: auto-click-cdp-popup
description: Automatically click macOS or Chrome UI prompts that mention Chrome DevTools Protocol. Use when Chrome DevTools Protocol, CDP, chrome-devtools MCP, DevTools remote debugging, or external protocol confirmation popups interrupt browser automation and the user wants the prompt accepted immediately.
---

# Auto Click CDP Popup

Start a local macOS Accessibility watcher that accepts Chrome remote debugging prompts.

## Quick Start

Run the bundled watcher from the skill directory:

```bash
scripts/auto-click-cdp-popup.sh
```

The watcher uses AXObserver notifications for new Chrome windows and sheets, then falls back to a light 1-second refresh to catch missed UI events.

For always-on use, run `scripts/install-launch-agent.sh`. It installs `~/Applications/AutoClickCDPPopup.app`, signs it locally, and registers a LaunchAgent that starts it at login. Grant Accessibility permission to `AutoClickCDPPopup.app`.

For one popup only:

```bash
scripts/auto-click-cdp-popup.sh --once --timeout 30
```

For a non-clicking check:

```bash
scripts/auto-click-cdp-popup.sh --dry-run --once --timeout 10
```

## Workflow

1. Start the watcher before triggering Chrome DevTools Protocol automation.
2. Keep it running while the automation may open a confirmation prompt.
3. Stop it with `Ctrl-C` when the task is complete.
4. If the script reports an Accessibility error, grant the current terminal or Codex host app macOS Accessibility permission, then rerun it.

## Script Behavior

`scripts/auto-click-cdp-popup.sh` compiles and runs the bundled Swift watcher. It uses macOS Accessibility notifications and clicks only when the accessible text for a Chrome UI element contains a Chrome remote debugging prompt.

Matched prompt text:

- `Chrome DevTools Protocol`
- `Allow remote debugging?`
- `external app wants full control over this Chrome session`

By default it watches:

- `Google Chrome`
- `Google Chrome Canary`
- `Chromium`
- `Brave Browser`
- `Arc`
- `Microsoft Edge`
- `osascript`
- `Script Editor`

Preferred button names are:

- `Open Chrome DevTools Protocol`
- `Allow`
- `Open`
- `OK`
- `Continue`
- `許可`
- `許可する`
- `開く`
- `続ける`

The script also accepts a button whose own label contains `Chrome DevTools Protocol`.

## Options

- `--once`: Exit after the first click, or with status 1 if no match is found before timeout.
- `--interval <seconds>`: Fallback refresh interval. Default is `1`.
- `--timeout <seconds>`: Stop after the given seconds. Default is no timeout.
- `--max-clicks <count>`: Stop after clicking the given number of prompts.
- `--process <name>`: Also watch the named macOS process.
- `--dry-run`: Report the matched button without clicking.
- `--log <path>`: Append timestamped results to a log file.
- `--prompt-for-accessibility`: Show the macOS Accessibility permission prompt once. Do not use this in LaunchAgent mode.
