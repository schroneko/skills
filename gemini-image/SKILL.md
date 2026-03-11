---
name: gemini-image
description: Gemini で画像を生成する。chrome-devtools MCP の autoConnect を使用して既存の Chrome セッションに接続し、ログイン済みの状態で画像生成を行う。「Gemini で画像生成」「猫耳美少女を生成」「Nano Banana で画像」などのリクエストで使用する。
---

# Gemini 画像生成（chrome-devtools MCP）

chrome-devtools MCP の autoConnect で既存の Chrome セッションに接続し、Gemini で画像を生成する。

## 前提条件

1. Chrome で `chrome://settings/content/all#devtools-remote-debugging` でリモートデバッグが許可されている
2. Chrome で Google アカウントにログイン済み

## ワークフロー

### Step 1: chrome-devtools MCP を確認

```bash
claude mcp list
```

`chrome-devtools` が表示されていれば Step 2 へ。表示されなければ追加する:

```bash
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --autoConnect
```

追加後はセッションの再起動が必要。ユーザーに `/exit` で退出して再起動するよう案内する。

### Step 2: 既存セッション確認

```
mcp__chrome-devtools__list_pages()
```

### Step 3: Gemini ページを開く

```
mcp__chrome-devtools__navigate_page(type="url", url="https://gemini.google.com/")
```

### Step 4: スナップショット取得

```
mcp__chrome-devtools__take_snapshot()
```

`textbox "ここにプロンプトを入力してください"` の uid を確認する。

### Step 5: プロンプト入力

```
mcp__chrome-devtools__fill(uid="<textbox_uid>", value="<prompt>")
```

uid はスナップショットから取得した値を使用。

### Step 6: 送信

```
mcp__chrome-devtools__press_key(key="Enter")
```

### Step 7: 生成完了待機

画像生成には 30-60 秒かかる。スナップショットで進捗を確認:

```
mcp__chrome-devtools__take_snapshot()
```

「生成中」などの表示が消えるまで待つ。

### Step 8: 結果確認

スクリーンショットで生成結果を確認:

```
mcp__chrome-devtools__take_screenshot()
```

### Step 9: 画像をダウンロード

スナップショットで `button "フルサイズの画像をダウンロード"` の uid を取得し、クリック:

```
mcp__chrome-devtools__click(uid="<download_button_uid>")
```

ダウンロード先は ~/Downloads/Gemini*Generated_Image*\*.png。

ファイルの検索:

```bash
mdfind "kMDItemDisplayName == 'Gemini_Generated_'" -onlyin ~/Downloads
```

サイズの確認:

```bash
sips -g pixelWidth -g pixelHeight <file>
```

## アスペクト比の指定

Gemini ウェブ版はデフォルトで横長（約 16:9）の画像を生成する。
プロンプト末尾にアスペクト比を明記することで制御可能:

| 指定方法                                       | 結果                   |
| ---------------------------------------------- | ---------------------- |
| `square format, 1:1 aspect ratio`              | 2048x2048 (正確に 1:1) |
| `16:9 aspect ratio, widescreen format`         | 2752x1536 (ほぼ 16:9)  |
| `9:16 aspect ratio, portrait format, vertical` | 1536x2752 (ほぼ 9:16)  |
| 指定なし                                       | 2816x1536 (約 1.83:1)  |

## プロンプトのコツ

- 「no text」を含めると画像内にテキストが生成されにくい
- スタイル指定: "flat illustration style", "anime style", "photorealistic" など
- 背景色指定: "blue background", "transparent background" など
- アスペクト比はプロンプト末尾に付ける

## プロンプト例

正方形のイラスト風猫画像:

```
flat illustration style, a fluffy cute cat with soft fur, gentle expression, pastel pink background, simple and iconic design, no text, square format, 1:1 aspect ratio
```

スタイル指定:

```
Nano Banana Pro で夕焼けの海辺の風景画を生成してください。油絵風でお願いします
```

詳細指定:

```
Nano Banana Pro でサイバーパンク風の東京の街並みを生成してください。ネオンライト、雨、夜景
```

## トラブルシューティング

### 接続エラー

「No inspectable pages found」または「Could not find DevToolsActivePort」の場合:

1. Chrome が起動しているか確認
2. `chrome://settings/content/all#devtools-remote-debugging` でリモートデバッグを許可
3. Chrome を再起動

DevToolsActivePort ファイルが古くなっている場合の修復手順は chrome-devtools-mcp スキルを参照。

### Chrome 144+ での注意

Chrome 144+ では `--remote-debugging-port` にデフォルトのユーザーデータディレクトリを使えない。autoConnect モードを使うこと。autoConnect なら通常のプロファイルでログイン状態が維持される。

### ログイン要求

Gemini にログインが必要な場合:

1. Chrome で手動で gemini.google.com にアクセス
2. Google アカウントでログイン
3. 再度スキルを実行

### fill が効かない場合

Gemini の入力欄が DIV 要素の場合、`evaluate_script` で JavaScript 操作:

```
mcp__chrome-devtools__evaluate_script(function="() => {
  const input = document.querySelector('[aria-label=\"ここにプロンプトを入力してください\"]');
  input.focus();
  input.textContent = 'プロンプト';
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
}")
```

### 画像生成が失敗する

Gemini の制限（不適切なコンテンツなど）に引っかかっている可能性。プロンプトを修正して再試行。
