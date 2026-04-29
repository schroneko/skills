---
name: codex-computer-use
description: Claude Code や Codex から `codex exec` 経由で Codex Computer Use MCP を使い、macOS アプリやブラウザを読み取り・クリック・入力操作する。Chrome/Safari/Finder などの GUI 状態確認、ブラウザ UI 検証、アプリ操作の代行、Claude Code から Computer Use を間接利用したい場合に使用する。`SkyComputerUseClient` を他エージェントの MCP として直接登録しようとして失敗した場合にも使用する。
---

# Codex Computer Use

## Purpose

Use Codex.app bundled CLI as the Computer Use bridge. Do not register OpenAI's bundled `SkyComputerUseClient` directly in Claude Code; macOS launch constraints can kill it when the parent process is not Codex.

Use this pattern:

```bash
codex exec --sandbox read-only --ephemeral --skip-git-repo-check -C "$PWD" "PROMPT"
```

## Preconditions

Installing this skill is not enough by itself. The host machine also needs Codex.app's Computer Use plugin, the Codex.app bundled CLI, and per-app Computer Use approval.

Check these before diagnosing Computer Use failures:

```bash
which codex
codex --version
codex mcp list
```

Expected:

- `codex` should be the Codex.app bundled CLI, usually `/Applications/Codex.app/Contents/Resources/codex`
- `codex mcp list` should include `computer-use`
- Target apps must be installed and running before `get_app_state`

If `which codex` points to a Homebrew-only CLI, prefer the Codex.app bundled CLI. One working pattern is to remove the Homebrew cask and symlink the app bundled binary:

```bash
brew uninstall --cask codex
ln -s /Applications/Codex.app/Contents/Resources/codex /opt/homebrew/bin/codex
```

Only do this after confirming the user wants the Codex.app bundled CLI to own `codex`.

## First-Time Setup

1. Install and open Codex.app.
2. Confirm `codex mcp list` shows `computer-use`.
3. Confirm the target app exists and has a bundle identifier:

```bash
mdls -name kMDItemCFBundleIdentifier -raw /Applications/Google\ Chrome.app
```

4. Approve the app for Computer Use, either interactively or by editing the approval JSON after user consent.
5. Start the target app before running `codex exec`.
6. Run a read-only `get_app_state` smoke test before clicking or typing.

The app approval file is:

```text
/Users/username/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/Library/Application Support/Software/ComputerUseAppApprovals.json
```

Expected shape:

```json
{
  "approvedBundleIdentifiers": [
    "com.google.Chrome",
    "com.apple.Safari",
    "com.apple.finder"
  ]
}
```

## Claude Code Usage

Invoke Computer Use through `codex exec` from Bash. Keep the prompt explicit and constrained.

Read-only app inspection:

```bash
codex exec --sandbox read-only --ephemeral --skip-git-repo-check -C "$PWD" \
  "Do not run shell commands. Use computer-use MCP only. Call get_app_state for Google Chrome exactly once. Do not click, type, scroll, drag, press keys, or switch apps. Report only whether the call succeeded or failed and the exact error if it failed."
```

Single click:

```bash
codex exec --sandbox read-only --ephemeral --skip-git-repo-check -C "$PWD" \
  "Do not run shell commands. Use computer-use MCP only. In Safari, inspect the visible page. Click the visible Increment button exactly once. Do not navigate away, do not interact with browser chrome controls, extensions, account UI, or other tabs. Report whether it succeeded."
```

Single input:

```bash
codex exec --sandbox read-only --ephemeral --skip-git-repo-check -C "$PWD" \
  "Do not run shell commands. Use computer-use MCP only. In Safari, inspect the visible page. Set the visible text input to 'hello-codex'. Do not submit forms, navigate away, or interact with other tabs. Report whether it succeeded."
```

Use `--sandbox read-only` to protect files. Remember that it does not make GUI clicks or typing read-only; the prompt must constrain GUI behavior.

## Browser Choice

Prefer Chrome when it is installed and visible to LaunchServices:

```bash
ls -ld /Applications/Google\ Chrome.app
mdls -name kMDItemCFBundleIdentifier -raw /Applications/Google\ Chrome.app
open -a "Google Chrome"
```

Fallback to Safari when Chrome is missing, being reinstalled, or returns `appNotFound`:

```bash
open -a Safari
```

Browser Use is separate from Computer Use. If `browser-use` is not shown by `codex mcp list`, use Computer Use for Chrome/Safari GUI operations.

## Approvals

`codex exec` cannot answer Computer Use approval elicitation interactively. If a target app is not approved, one of these errors can appear:

```text
Computer Use approval denied via MCP elicitation for app '...'
```

Fix by either:

- Run interactive `codex`, request a harmless `get_app_state` for the target app, and choose `Always allow`
- Add the target bundle identifier to `ComputerUseAppApprovals.json` when the user has approved broad app access

Common bundle identifiers:

```text
ai.elementlabs.lmstudio
com.1password.1password
com.amazon.Lassen
com.anthropic.claudefordesktop
com.apple.Safari
com.apple.dt.Xcode
com.apple.finder
com.electron.ollama
com.google.Chrome
com.google.GeminiMacOS
com.google.antigravity
com.google.drivefs
com.google.drivefs.shortcuts.docs
com.google.drivefs.shortcuts.sheets
com.google.drivefs.shortcuts.slides
com.hnc.Discord
com.mitchellh.ghostty
com.tinyspeck.slackmacgap
com.todesktop.230313mzl4w4u92
pl.maketheweb.cleanshotx
ru.keepcoder.Telegram
us.zoom.xos
```

## Failure Handling

For `Apple event error -10000: Sender process is not authenticated`, verify that `codex` points to the Codex.app bundled CLI. Homebrew-only CLI can see tools but fail Apple Events.

For `Code Signature Invalid` or `SkyComputerUseClient quit unexpectedly` when started by Claude, do not retry direct MCP registration. Use `codex exec` as the bridge.

For `appNotFound("Google Chrome")`, check whether Chrome is installed, currently being reinstalled, or not running. Start it and retry.

For sensitive pages, avoid quoting page text, URLs, filenames, account data, or UI tree details. Ask Codex to report only success/failure and exact errors.

## Safe Prompt Rules

Always specify:

- Target app name
- Target page or window when known
- Allowed tool family: `computer-use MCP only`
- Forbidden actions: no shell commands, no navigation, no other tabs, no account UI
- Exact action count: click once, type one value, inspect once
- Reporting limits: no private page contents or UI tree dumps

Use a local throwaway page for destructive or uncertain tests before touching real pages.
