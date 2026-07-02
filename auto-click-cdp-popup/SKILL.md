---
name: auto-click-cdp-popup
description: Automatically click macOS or Chrome UI prompts that mention Chrome DevTools Protocol. Use when Chrome DevTools Protocol, CDP, chrome-devtools MCP, DevTools remote debugging, or external protocol confirmation popups interrupt browser automation and the user wants the prompt accepted immediately.
---

# Auto Click CDP Popup

Run the cdpclick macOS Accessibility watcher that accepts Chrome remote debugging prompts. The watcher is distributed only through Homebrew from `schroneko/homebrew-cdpclick`. Do not build or copy it locally.

## Install

```bash
brew install --cask schroneko/cdpclick/cdpclick
cdpclick-install-agent
```

`cdpclick-install-agent` registers a LaunchAgent that runs `/Applications/AutoClickCDPPopup.app` at login. After installing or upgrading, grant Accessibility permission to `AutoClickCDPPopup.app` in System Settings > Privacy & Security > Accessibility. The ad-hoc code signature changes on every release, so the permission must be re-granted after every `brew upgrade --cask cdpclick`.

## Status Check

Confirm the watcher is running and healthy:

```bash
pgrep -fl AutoClickCDPPopup
```

Read the last lines of `~/Library/Logs/auto-click-cdp-popup/actions.log`. A healthy watcher logs `started: watching Chrome remote debugging prompts` and `clicked:` entries. Repeated `waiting: Accessibility permission is required` means the Accessibility permission is missing or was invalidated by a signature change; re-grant it in System Settings.

## One-Shot Run

For a single popup without the LaunchAgent:

```bash
/Applications/AutoClickCDPPopup.app/Contents/MacOS/auto-click-cdp-popup --once --timeout 30
```

For a non-clicking check:

```bash
/Applications/AutoClickCDPPopup.app/Contents/MacOS/auto-click-cdp-popup --dry-run --once --timeout 10
```

## Uninstall

```bash
cdpclick-uninstall-agent
brew uninstall --cask cdpclick
```

## Watcher Behavior

The watcher uses AXObserver notifications for new Chrome windows and sheets, then falls back to a light 1-second refresh. It clicks only when the accessible text for a Chrome UI element contains a Chrome remote debugging prompt.

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

It also accepts a button whose own label contains `Chrome DevTools Protocol`.

## Options

- `--once`: Exit after the first click, or with status 1 if no match is found before timeout.
- `--interval <seconds>`: Fallback refresh interval. Default is `1`.
- `--timeout <seconds>`: Stop after the given seconds. Default is no timeout.
- `--max-clicks <count>`: Stop after clicking the given number of prompts.
- `--process <name>`: Also watch the named macOS process.
- `--dry-run`: Report the matched button without clicking.
- `--log <path>`: Append timestamped results to a log file.
- `--prompt-for-accessibility`: Show the macOS Accessibility permission prompt once. Do not use this in LaunchAgent mode.

## Source

The watcher source and cask live in `schroneko/homebrew-cdpclick`. Release a new version with `scripts/build-app.sh VERSION` and `gh release create` in that repository, then update `Casks/cdpclick.rb`.
