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

Check these before diagnosing Computer Use failures:

```bash
codex --version
codex mcp list
```

Expected:

- `codex` should be the Codex.app bundled CLI, usually `/Applications/Codex.app/Contents/Resources/codex`
- `codex mcp list` should include `computer-use`
- Target apps must be installed and running before `get_app_state`

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
com.google.Chrome
com.apple.Safari
com.apple.finder
com.anthropic.claudefordesktop
com.todesktop.230313mzl4w4u92
com.mitchellh.ghostty
com.tinyspeck.slackmacgap
com.hnc.Discord
ru.keepcoder.Telegram
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
