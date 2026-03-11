---
name: nifs-archive-download
description: NIFS 核融合科学研究所の研究資料アーカイブから目録データの PDF をダウンロードする。chrome-devtools MCP の autoConnect で既存 Chrome セッションに接続し、ログイン済み状態で API 経由で高速ダウンロードを行う。「NIFS からダウンロード」「アーカイブをダウンロード」「核融合資料をダウンロード」などのリクエストで使用する。
---

# NIFS アーカイブ PDF ダウンロード

chrome-devtools MCP + API 直接アクセスで NIFS 研究資料アーカイブ (archives.nifs.ac.jp) から PDF を高速ダウンロードする。

## 前提条件

1. chrome-devtools MCP (`npx -y chrome-devtools-mcp@latest --autoConnect`) が設定済み
2. Chrome で `chrome://inspect/#remote-debugging` のリモートデバッグが有効
3. Chrome で archives.nifs.ac.jp に Google アカウントでログイン済み

## 保存先

プロジェクト内の `resources/` ディレクトリに保存する。ファイル名は識別記号 (例: `nifs-002-0145-015-003.pdf`) を使用する。

## ダウンロード手順

### Step 1: archives.nifs.ac.jp を開く

ログイン済みページを開いてセッションを確立する。

```
mcp__chrome-devtools__navigate_page(type="url", url="https://archives.nifs.ac.jp/catalogs")
```

### Step 2: JWT トークンを取得

```
mcp__chrome-devtools__evaluate_script(function="() => { const t = sessionStorage.getItem('token'); return t ? JSON.parse(t).token.substring(0, 20) + '...' : null; }")
```

トークンが null の場合はログインが必要。Chrome で手動ログインしてからリトライする。

### Step 3-4: URL 取得→即ダウンロードをバッチで繰り返す

署名付き URL の TTL は 60 秒しかないため、URL 取得とダウンロードを密結合で実行する。1 バッチ 5 件で「URL 取得→サブエージェント委任」を即座に行う。

```
mcp__chrome-devtools__evaluate_script(function="async () => {
  const tokenData = JSON.parse(sessionStorage.getItem('token'));
  const token = tokenData.token;
  const ids = [636, 1139, 1140, 1141, 1142];  // 1バッチ5件まで
  const results = [];
  for (const id of ids) {
    const urlRes = await fetch(`/api/catalogs/${id}/url`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (urlRes.status !== 200) {
      results.push({ id, status: urlRes.status, url: null, identifier: null });
      continue;
    }
    const url = await urlRes.text();
    const metaRes = await fetch(`/api/catalogs/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const meta = await metaRes.json();
    results.push({ id, status: 200, url, identifier: meta.identifier });
  }
  return results;
}")
```

レスポンス:

- `status: 200` - PDF あり。`url` と `identifier` が返る
- `status: 404` - デジタル化されていない資料。PDF なし
- `status: 401` - トークン期限切れ。Step 1 からやり直す

URL 取得後、即座にサブエージェントを起動してダウンロードを委任する:

```
Task(
  subagent_type="Bash",
  description="NIFS PDF download batch",
  prompt="以下の PDF をダウンロードしてください。各 curl は順次実行してください。
ダウンロード後、各ファイルが 100 バイト以上あることを確認してください。
100 バイト未満のファイルは署名切れの可能性があるため報告してください。

保存先: {project_root}/resources/

ダウンロードリスト:
1. curl -sL -o {project_root}/resources/{identifier1}.pdf '{url1}'
2. curl -sL -o {project_root}/resources/{identifier2}.pdf '{url2}'
...

最後に ls -lhS {project_root}/resources/ で結果を確認してください。"
)
```

サブエージェントは `run_in_background: true` で起動し、すぐに次のバッチの URL 取得に移る。

コンテキスト溢れ防止のため、以下のフロー制御を厳守する:

1. 同時に実行中のサブエージェントは最大 3 つまで
2. 3 つ起動したら、TaskOutput(block=true) で 1 つ以上の完了を待ってから次を起動する
3. 完了したサブエージェントの結果は簡潔に記録し、詳細をコンテキストに残さない

### Step 5: ダウンロード確認

サブエージェントの結果を TaskOutput で回収し、失敗したファイルがあれば再取得する。

```bash
ls -lhS resources/
```

100 バイト未満のファイルは署名切れのため、Step 3-4 から再取得が必要。

## 大量ダウンロード (シェルスクリプト方式, 推奨)

50 件以上のダウンロードにはバンドルスクリプトを使う。JWT トークンを抽出してシェルから直接 API を叩くため、ブラウザ経由の TTL 問題を回避できる。

### Step 1: JWT トークンを抽出

```
mcp__chrome-devtools__evaluate_script(function="() => {
  const tokenData = JSON.parse(sessionStorage.getItem('token'));
  return tokenData.token;
}")
```

### Step 2: 未ダウンロード一覧を作成

全カタログの id/identifier を API で取得し、既存ファイルと比較して未ダウンロード分の TSV を作成する:

```bash
# 全カタログ取得 (ブラウザ内で実行)
# -> id と identifier のペアを TSV に保存

# ダウンロード済み identifier を取得
ls {project_root}/resources/*.pdf | xargs -I{} basename {} .pdf | sort > /tmp/nifs-downloaded-ids.txt

# 全 identifier から未ダウンロード分を抽出
comm -23 /tmp/nifs-all-ids.txt /tmp/nifs-downloaded-ids.txt > /tmp/nifs-missing-ids.txt

# identifier と catalog_id の対応 TSV を作成
# 形式: identifier\tcatalog_id
```

### Step 3: バッチダウンロード実行

```bash
SKILL_DIR="<this skill's scripts/ directory>"

$SKILL_DIR/batch-download.sh "JWT_TOKEN" /tmp/nifs-missing-catalog.tsv {project_root}/resources START_LINE END_LINE
```

引数:

1. JWT トークン (文字列)
2. TSV ファイルパス (identifier\tcatalog_id 形式)
3. 出力ディレクトリ
4. 開始行番号 (省略時: 1)
5. 終了行番号 (省略時: 99999)

300 件ずつ分割してサブエージェント(Bash, run_in_background)で並列実行する:

```
Task(subagent_type="Bash", run_in_background=true,
  prompt="$SKILL_DIR/batch-download.sh TOKEN TSV_FILE OUTPUT_DIR 1 300")
Task(subagent_type="Bash", run_in_background=true,
  prompt="$SKILL_DIR/batch-download.sh TOKEN TSV_FILE OUTPUT_DIR 301 600")
Task(subagent_type="Bash", run_in_background=true,
  prompt="$SKILL_DIR/batch-download.sh TOKEN TSV_FILE OUTPUT_DIR 601 900")
```

### Step 4: 結果確認

サブエージェント完了後、ファイル数を確認する。FAIL のものは JWT トークン期限切れの可能性があるため、トークンを再取得して再実行する。

## 少数ダウンロード (ブラウザ方式)

50 件未満のダウンロードには、ブラウザ内で署名付き URL を取得して個別の `Bash(run_in_background=true)` で curl する方式が適している。

1. ブラウザで 5 件分の署名付き URL を取得 (evaluate_script)
2. 5 つの `Bash(run_in_background=true)` で curl を同時起動
3. 次の 5 件の URL を取得して繰り返す

署名付き URL の TTL は 60 秒。サブエージェントに順次 curl を委任すると巨大ファイル (100MB+) で後続の URL が期限切れになるため、必ず個別の並列 curl を使う。

### JWT トークンの有効期限

- Google の JWT トークンは通常 1 時間で期限切れになる
- 401 エラーが返った場合は Step 1 に戻ってページをリロードし、新しいトークンを取得する

## 目録一覧の取得 (API)

全 3419 件の catalog_id を API で取得する:

```
mcp__chrome-devtools__evaluate_script(function="async () => {
  const tokenData = JSON.parse(sessionStorage.getItem('token'));
  const token = tokenData.token;
  const allIds = [];
  for (let page = 1; page <= 69; page++) {
    const res = await fetch(`/api/catalogs?page=${page}&per_page=50`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const ids = data.data.map(d => d.id);
    allIds.push(...ids);
    if (ids.length < 50) break;
  }
  return { total: allIds.length, ids: allIds };
}")
```

全件を一度に取得するとレスポンスが大きいため、必要な範囲のページだけ取得するのが実用的。

## トラブルシューティング

### トークンが取得できない (null)

Chrome で archives.nifs.ac.jp にアクセスし、Google アカウントでログインする。ログイン後にセッションストレージにトークンが格納される。

### 401 Unauthorized

JWT トークンが期限切れ。archives.nifs.ac.jp をリロードして新しいトークンを取得する。

### 404 Not Found

その catalog_id にはデジタル化された PDF が存在しない。スキップする。

### ダウンロードしたファイルが PDF でない (40 バイト / JSON)

署名付き URL の有効期限切れ (TTL 60 秒)。ファイル内容は `{"result":"error","message":"Forbidden"}`。Step 3-4 からやり直して新しい URL を取得する。`file` コマンドで確認: `file resources/*.pdf` (JSON data と表示される)
