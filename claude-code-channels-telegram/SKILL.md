---
name: claude-code-channels-telegram
description: Claude Code Channels を Telegram bot として常駐起動し、Hermes Agent profile や既存人格を混ぜずに移行する。Telegram から Claude Code Channels が返事しない、CLAUDE.md が混入する、Hermes profile の性格や memory が反映されない、launchd/tmux 常駐を確認したい場合に使用する。
---

# Claude Code Channels Telegram

Claude Code Channels を Telegram bot として常駐させるときの移行・診断手順。

目的は、通常の Claude Code セッションと Telegram 常駐セッションの人格・指示ファイルを分離しつつ、Claude Max/OAuth と Telegram plugin の認証状態は壊さないこと。

## 原則

- 通常の Claude Code と Claude Code Channels の `CLAUDE.md` は分ける。
- `HOME` を変えると Claude Max/OAuth や keychain 参照が切れることがあるため、まず避ける。
- `--bare` は `CLAUDE.md` auto-discovery を止められるが、OAuth/keychain も読まなくなるため、通常は避ける。
- Channels 専用の `--settings` で `claudeMdExcludes` を指定し、通常の `~/.claude/CLAUDE.md` だけ除外する。
- Persona や memory は `--append-system-prompt-file` で Channels 用 prompt として追加する。
- `--system-prompt-file` はデフォルト system prompt を置き換えるため、Channels/plugin 挙動が変わる場合がある。通常は `--append-system-prompt-file` を使う。
- `--permission-mode bypassPermissions` を使う場合は、組み込み tools を `--tools ''` で無効化し、Telegram reply/react/edit など必要な MCP tool だけ `--allowedTools` で許可する。
- Telegram token、allowlist user id、profile memory 本体は skill に保存しない。

## 推奨構成

```text
launchd
-> start.sh
-> build-system-prompt.sh
-> tmux new-session
-> claude --channels plugin:telegram@claude-plugins-official
```

## 必須ファイル

例では配置先を `$runtime_dir` とする。

```text
$runtime_dir/start.sh
$runtime_dir/settings.json
$runtime_dir/system.generated.md
$runtime_dir/logs/
```

`settings.json`:

```json
{
  "claudeMdExcludes": [
    "/Users/username/.claude/CLAUDE.md"
  ]
}
```

`claudeMdExcludes` には、通常 Claude Code が読んでしまう global `CLAUDE.md` の実パスを入れる。symlink の場合でも、まず表示上の `~/.claude/CLAUDE.md` を除外する。

## 起動コマンド

```bash
claude \
  --settings "$runtime_dir/settings.json" \
  --append-system-prompt-file "$runtime_dir/system.generated.md" \
  --tools '' \
  --no-chrome \
  --permission-mode bypassPermissions \
  --allowedTools 'mcp__plugin:telegram:telegram__reply' \
  --allowedTools 'mcp__plugin:telegram:telegram__react' \
  --allowedTools 'mcp__plugin:telegram:telegram__edit_message' \
  --channels plugin:telegram@claude-plugins-official \
  --name nukoevi-telegram
```

`--name` は実際の bot/profile 名に合わせる。

## start.sh の形

```bash
#!/bin/zsh
set -eu

export HOME="/Users/username"
export PATH="/Users/username/.local/bin:/opt/homebrew/bin:/Users/username/.local/share/mise/shims:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

session_name="claude-telegram-channel"
workdir="/path/to/workdir"
runtime_dir="/Users/username/.local/share/claude-telegram-channel"
prompt_file="${runtime_dir}/system.generated.md"
settings_file="${runtime_dir}/settings.json"

if tmux has-session -t "${session_name}" 2>/dev/null
then
  exit 0
fi

/bin/zsh "${runtime_dir}/build-system-prompt.sh"

exec tmux new-session -d -s "${session_name}" -c "${workdir}" "claude --settings ${settings_file} --append-system-prompt-file ${prompt_file} --tools '' --no-chrome --permission-mode bypassPermissions --allowedTools 'mcp__plugin:telegram:telegram__reply' 'mcp__plugin:telegram:telegram__react' 'mcp__plugin:telegram:telegram__edit_message' --channels plugin:telegram@claude-plugins-official --name nukoevi-telegram"
```

## Hermes profile から prompt を生成する場合

Hermes Agent 側で personality と memory が自動ロードされていた場合、Channels 側でも同等の情報を prompt に入れる。

含めるもの:

- `config.yaml` の `display.personality`
- personality 名が Hermes の組み込み personality を指す場合、その展開後の口調 prompt
- `SOUL.md`
- `mission.md`
- `memories/MEMORY.md`
- `memories/USER.md`
- その bot 固有の呼び名、禁止したい混線、外部アクション承認ゲート

含めないもの:

- skill 群
- Telegram token
- allowlist user id
- 一時セッション ID や PID
- 他人格の口調や memory

人格分離が重要な場合は、prompt の先頭に「この Telegram 常駐セッションでは通常 Claude Code の persona を使わない」「別人格を混ぜない」と明示する。

## launchd 常駐

`~/Library/LaunchAgents/<label>.plist` から `start.sh` を起動する。

確認:

```bash
launchctl print gui/$(id -u)/<label>
tmux has-session -t claude-telegram-channel
tmux capture-pane -pt claude-telegram-channel -S -80
pgrep -af "claude.*plugin:telegram|nukoevi-telegram|claude-telegram-channel"
```

再起動:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/<label>.plist
tmux kill-session -t claude-telegram-channel
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<label>.plist
```

`bootout` 後に launchd が `StartInterval` で復帰することがある。修正後の prompt や settings を確実に読ませるため、`bootout`、`tmux kill-session`、`bootstrap` の順で実行する。

## 診断チェックリスト

### CLAUDE.md が混ざっていないか

実行中プロセスに `--settings <runtime>/settings.json` が入っているか確認する。

```bash
pgrep -af "claude.*plugin:telegram"
```

`settings.json` に `claudeMdExcludes` が入っているか確認する。

```bash
sed -n '1,120p' "$runtime_dir/settings.json"
```

`CLAUDE.md` 分離の smoke test:

```bash
claude -p \
  --tools '' \
  --no-chrome \
  --settings "$runtime_dir/settings.json" \
  --append-system-prompt-file "$runtime_dir/system.generated.md" \
  "Telegramへは送らず、この画面だけで確認します。挨拶へ1行でどう返しますか？"
```

通常 Claude Code の persona が出ず、Channels 用 persona が出ればよい。

### Telegram tool permission が詰まる

reply tool が permission で止まる場合:

- `--allowedTools 'mcp__plugin:telegram:telegram__reply'` が入っているか確認する。
- `--permission-mode bypassPermissions` を使っているか確認する。
- bypass を使う場合は `--tools ''` で組み込み tools を無効化しているか確認する。

### Telegram plugin が見えない

```bash
claude mcp list
```

`plugin:telegram:telegram` が connected であることを確認する。

### 同じ bot token を使っているか

Hermes と Channels を同じ Telegram bot に載せる場合、Hermes gateway は止める。同じ bot token を複数プロセスで polling すると片方が返事しないことがある。

token 値は出力しない。必要なら hash だけ比較する。

### モデル確認

tmux pane のヘッダーで Claude Code が表示する model を確認する。

```bash
tmux capture-pane -pt claude-telegram-channel -S -30
```

## 完了条件

- 実行中 `claude` プロセスに `--settings <runtime>/settings.json` が入っている。
- `settings.json` に global `CLAUDE.md` の `claudeMdExcludes` が入っている。
- 実行中 `claude` プロセスに `--append-system-prompt-file <runtime>/system.generated.md` が入っている。
- tmux pane に `Listening for channel messages from: plugin:telegram@claude-plugins-official` が出ている。
- ローカル smoke test で Channels 用 persona が返る。
- Telegram の通常メッセージに reply tool 経由で返答できる。
