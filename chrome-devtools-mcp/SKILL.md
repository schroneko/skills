---
name: chrome-devtools-mcp
description: chrome-devtools MCP の設定・接続を行い、Chrome ブラウザを操作する。「chrome-devtools MCP を使って欲しい」「chrome-devtools MCP を使いたい」「Chrome で操作して」「ブラウザで確認して」などのリクエストで使用する。
---

# chrome-devtools MCP セットアップ

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

### autoConnect が DevToolsActivePort エラーで失敗する

`Could not find DevToolsActivePort` だけでは、ファイルが古いことや Remote debugging が無効なことの証拠にならない。ユーザーのログイン済み Chrome を終了したり、DevToolsActivePort を削除したりせず、まず読み取り専用で状態を切り分ける。

1. Chrome のプロセスと DevToolsActivePort の内容を確認する。
2. ファイルに記載されたポートの待受を `lsof -nP -iTCP:<ポート番号> -sTCP:LISTEN` で確認する。
3. `http://127.0.0.1:<ポート番号>/json/version` の応答を確認する。
4. Chrome DevTools MCP の daemon status、ログ、target routing、および CLI の `status`、`list_pages` または `new_page`、`navigate_page`、`take_snapshot` を確認する。

待受がなく、ファイルのポートと一致しない場合は stale file の可能性があるが、確認のために Chrome を強制終了したりファイルを削除したりしない。Remote debugging の無効を報告するのは、設定画面の無効表示またはそれを直接示すエラーを確認した場合だけにする。

Chrome 153 の通常プロファイルでは、ポート 9222 の待受がある一方で `/json/version` が 404 を返し、`--autoConnect` が `Could not find DevToolsActivePort` で失敗する状態を確認した。[Chrome DevTools MCP issue 2283](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2283) には Chrome 150 で同じ症状の報告があるが、同一原因とは限らない。通常経路で接続できない場合は、設定を変えずに次のネイティブCDPブリッジを確認する。

### AutoClick ネイティブCDPブリッジへの切替

インストール済みの場合、まずブリッジの状態を確認する。

```bash
/Applications/AutoClickCDPPopup.app/Contents/MacOS/auto-click-cdp-popup --bridge-status
```

`--bridge-status` が利用可能な場合は `--bridge-request` で `tabs.list`、`debugger.attach`、`debugger.command`、`debugger.detach` を呼び出せる。タブ一覧には他のタブの URL も含まれるため、ユーザーが指定した対象 URL に絞ってから結果を表示する。毎回最新のタブ ID を取得し、対象タブだけに接続する。

対象タブへ attach 後、CDP コマンドを `debugger.command` で送る。要素をクリックするときは、DOM から対象要素を特定し、`DOM.scrollIntoViewIfNeeded` と `DOM.getBoxModel` で表示位置を確認してから、`Input.dispatchMouseEvent` の mouseMoved、mousePressed、mouseReleased をその位置へ送る。完了後は必ず `debugger.detach` する。

この経路は Chrome の CDP コマンドを中継する。AutoClick の自動クリック watcher や Accessibility 操作とは別なので、ブリッジ用途では `--bridge-status` と `--bridge-request` だけを使う。

### --remote-debugging-port は使わない (Chrome 144+)

Chrome 144+ では `--remote-debugging-port` にデフォルトのユーザーデータディレクトリを使えない:

> DevTools remote debugging requires a non-default data directory.

`--user-data-dir` を指定すれば動くが、別プロファイルになりログイン状態が失われる。`open -a "Google Chrome" --args --remote-debugging-port=9222` も同じ理由で機能しない。

通常は autoConnect を使う。接続できない場合は上記の読み取り診断とネイティブCDPブリッジへの切替を行い、別プロファイルを起動してログイン状態を失わないようにする。
