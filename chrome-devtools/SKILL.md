---
name: chrome-devtools
description: chrome-devtools MCP の設定・接続を行い、Chrome ブラウザを操作する。「chrome-devtools を使って欲しい」「Chrome で操作して」「ブラウザで確認して」などのリクエストで使用する。
---

# chrome-devtools

Chrome DevTools Protocol (CDP) 経由で Chrome ブラウザを操作するための MCP サーバーを設定・接続する。

## セットアップ手順

### Step 1: MCP 設定を確認

```bash
claude mcp list
```

`chrome-devtools` が表示されなければ Step 2 へ。表示されていれば Step 3 へ。

### Step 2: MCP サーバーを追加

autoConnect モード (推奨、Chrome 144+):

Chrome の `chrome://inspect/#remote-debugging` で「Allow remote debugging for this browser instance」を有効にした上で:

```bash
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --autoConnect
```

追加後はセッションの再起動が必要。ユーザーに `/exit` で退出して再起動するよう案内する。再起動後にこのスキルを再度発火させてもらう。

### Step 3: Chrome の起動確認

```bash
pgrep -l "Google Chrome"
```

Chrome が起動していなければユーザーに起動を依頼する。

### Step 4: 接続テスト

```
mcp__chrome-devtools__list_pages()
```

タブ一覧が返れば接続成功。失敗した場合はトラブルシューティングへ。

## 基本操作

### ページ遷移

```
mcp__chrome-devtools__navigate_page(type="url", url="https://example.com")
```

### スクリーンショット

```
mcp__chrome-devtools__take_screenshot()
```

### DOM スナップショット

```
mcp__chrome-devtools__take_snapshot()
```

### JavaScript 実行

```
mcp__chrome-devtools__evaluate_script(function="() => document.title")
```

### 要素クリック

snapshot で uid を取得してからクリック:

```
mcp__chrome-devtools__click(uid="<uid>")
```

### テキスト入力

```
mcp__chrome-devtools__fill(uid="<uid>", value="入力テキスト")
```

### キー入力

```
mcp__chrome-devtools__press_key(key="Enter")
```

## タブ操作

### タブ一覧

```
mcp__chrome-devtools__list_pages()
```

### タブ切替

```
mcp__chrome-devtools__select_page(pageId=<page_id>)
```

## トラブルシューティング

### MCP ツールが見えない

セッション再起動が必要。`/exit` で退出して `claude` で再起動する。

### npm キャッシュ破損

`npx chrome-devtools-mcp@latest` が "command not found" になる場合:

```bash
npm cache clean --force
npx -y chrome-devtools-mcp@latest --help
```

### DevToolsActivePort が古い (autoConnect)

autoConnect は `~/Library/Application Support/Google/Chrome/DevToolsActivePort` を読んで接続する。Chrome の異常終了や `pkill` による強制終了でこのファイルが古くなり、ファイルにポート番号が書かれていても実際にはリッスンしていない状態になる。

`list_pages` で "Could not find DevToolsActivePort" エラーが出たら、まずこのファイルの鮮度を疑う。

診断手順:

1. Read ツールでファイルの内容を確認:

```
Read: ~/Library/Application Support/Google/Chrome/DevToolsActivePort
```

1 行目にポート番号（例: 9222）、2 行目に WebSocket パスが書かれている。

2. ファイルに書かれたポートが実際にリッスンしているか確認:

```bash
lsof -i :<ポート番号>
```

3. `lsof` の出力が空（Exit code 1）ならファイルが古い。以下で修復:

```bash
rm ~/Library/Application\ Support/Google/Chrome/DevToolsActivePort
pkill -9 "Google Chrome"
```

`pkill -TERM` では Chrome のサブプロセスが残ることがある。`pkill -9` で確実に全プロセスを終了させる。

4. 完全終了を待ってから再起動:

```bash
sleep 4
open -a "Google Chrome"
```

5. 起動後 5 秒ほど待ってから Read ツールで新しい DevToolsActivePort の内容を確認し、`list_pages` で接続テストする。

`chrome://inspect/#remote-debugging` の設定は Chrome 再起動後も維持される。

### --remote-debugging-port は使わない (Chrome 144+)

Chrome 144+ では `--remote-debugging-port` にデフォルトのユーザーデータディレクトリを使えない:

> DevTools remote debugging requires a non-default data directory.

`--user-data-dir` を指定すれば動くが、別プロファイルになりログイン状態が失われる。`open -a "Google Chrome" --args --remote-debugging-port=9222` も同じ理由で機能しない。

autoConnect モードを使うこと。autoConnect なら通常のプロファイルでログイン状態が維持される。
