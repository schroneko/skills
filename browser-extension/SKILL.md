---
name: browser-extension
description: ブラウザ拡張機能の作成から Web ストア公開までをガイドする。プロジェクト初期化、多言語対応、アセット自動生成、ZIP 作成を含む。「拡張機能を作りたい」「ストアに公開」などのリクエストで使用する。
---

# Browser Extension

ブラウザ拡張機能の作成から Web ストア公開までをガイドする。

## Phase 1: プロジェクト作成

### WXT プロジェクトの初期化

```bash
npm create wxt@latest my-extension
cd my-extension
npm install
```

### ディレクトリ構成

```
my-extension/
├── entrypoints/
│   ├── background.ts
│   ├── content.ts
│   └── popup/
│       ├── index.html
│       └── main.ts
├── public/
│   ├── icons/
│   └── _locales/
├── wxt.config.ts
└── package.json
```

### wxt.config.ts の基本構成

```ts
import { defineConfig } from "wxt";

export default defineConfig({
  // WXT デフォルトの .output は隠しフォルダで Chrome のファイル選択ダイアログから選べないため
  outDir: "dist",
  manifest: {
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    permissions: [],
    icons: {
      16: "icons/icon16.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
  },
});
```

### エントリーポイントの種類

| ファイル        | 用途             |
| --------------- | ---------------- |
| `background.ts` | Service Worker   |
| `content.ts`    | Content Script   |
| `popup/`        | ポップアップ UI  |
| `options/`      | オプションページ |

各エントリーポイントは `export default defineBackground()` や `export default defineContentScript()` で定義する。

## Phase 2: 開発

### 開発サーバー起動

```bash
npm run dev
```

開発中は常に `npm run dev` をバックグラウンドタスクとして実行する。HMR（Hot Module Replacement）でコード変更が自動反映される。

`chrome://extensions` で「パッケージ化されていない拡張機能を読み込む」から `dist/chrome-mv3` を選択。

### ビルド

```bash
npm run build
```

出力先: `dist/chrome-mv3/`

## Phase 3: 公開準備

### 1. 多言語対応

`public/_locales/en/messages.json` と `public/_locales/ja/messages.json` を作成。

[assets/messages-en.json](assets/messages-en.json) と [assets/messages-ja.json](assets/messages-ja.json) をテンプレートとして使用。

### 2. プライバシーポリシー

1 つのプライバシーポリシーで全拡張機能をカバー可能。拡張機能ごとに作成する必要はない。

| ホスティング方法      | 匿名性 | 備考                 |
| --------------------- | ------ | -------------------- |
| FreePrivacyPolicy.com | ◎      | 無料ホスティング付き |
| GitHub Gist           | ×      | アカウント紐付け     |
| GitHub Pages          | ×      | アカウント紐付け     |

匿名でホストしたい場合は [FreePrivacyPolicy.com](https://www.freeprivacypolicy.com/) を使用。

データ収集がない場合は「データを収集しません」と明記するだけで十分。[assets/privacy-policy-template.md](assets/privacy-policy-template.md) を参照。

### 3. ストア提出用テキスト

`store-assets/STORE_SUBMISSION.md` を作成。[assets/store-submission-template.md](assets/store-submission-template.md) を参照。

Dashboard で入力するテキストを事前に準備:

- Description（英語・日本語）
- Single Purpose
- Permission Justifications
- Privacy Policy URL

### 4. 必須アセット

| 種類                     | サイズ   | 必須            |
| ------------------------ | -------- | --------------- |
| スクリーンショット       | 1280x800 | 最低 1 枚       |
| プロモーション画像（小） | 440x280  | 必須            |
| アイコン                 | 128x128  | manifest に含む |

### 5. アイコン生成

画像から Chrome 拡張機能用のアイコン (16x16, 32x32, 48x48, 128x128) を生成する。アイコンをゼロからデザインする場合は [references/icon-design.md](references/icon-design.md) を参照。

#### 背景透過 + トリム + リサイズ

```bash
INPUT="input.png"
OUTPUT_DIR="public/icons"

mkdir -p "$OUTPUT_DIR"
magick "$INPUT" \
  -fuzz 10% \
  -fill none \
  -draw "color 0,0 floodfill" \
  -draw "color %[fx:w-1],0 floodfill" \
  -draw "color 0,%[fx:h-1] floodfill" \
  -draw "color %[fx:w-1],%[fx:h-1] floodfill" \
  -trim +repage \
  temp_trimmed.png

magick temp_trimmed.png -resize 16x16 "$OUTPUT_DIR/icon16.png"
magick temp_trimmed.png -resize 32x32 "$OUTPUT_DIR/icon32.png"
magick temp_trimmed.png -resize 48x48 "$OUTPUT_DIR/icon48.png"
magick temp_trimmed.png -resize 128x128 "$OUTPUT_DIR/icon128.png"
rm temp_trimmed.png
```

`-fuzz 10%` は背景色の許容範囲。背景が均一でない場合は値を調整。

#### ストア用アイコン（白背景）

Chrome Web Store では透明背景の PNG が黒く表示される。ショップアイコン用に白背景バージョンを作成する:

```bash
magick public/icons/icon128.png -background white -flatten -resize 128x128 public/icons/icon128-store.png
```

`icon128-store.png` は ZIP には含めず、ダッシュボードの「ショップアイコン」に手動でアップロードする。拡張機能本体のアイコン（ツールバー表示）は透明のままで良い。

### 6. プロモーション画像の自動生成

Puppeteer を使って 440x280 のプロモーション画像を自動生成できる。

```bash
npm install -D puppeteer
```

[assets/generate-promo-image.mjs](assets/generate-promo-image.mjs) を `scripts/` にコピーし、package.json に追加:

```json
{
  "scripts": {
    "generate:promo": "node scripts/generate-promo-image.mjs"
  }
}
```

実行:

```bash
npm run generate:promo
```

出力先: `store-assets/promo-small.png`

### 7. スクリーンショットの自動生成

Puppeteer で拡張機能をロードし、Chrome Web Store 用スクリーンショット（1280x800）を自動生成できる。

[assets/generate-screenshots.mjs](assets/generate-screenshots.mjs) を `scripts/` にコピーし、package.json に追加:

```json
{
  "scripts": {
    "generate:screenshots": "node scripts/generate-screenshots.mjs"
  }
}
```

実行:

```bash
npm run generate:screenshots
```

出力先: `store-assets/`

技術的な特徴:

- `headless: "new"` モードで完全バックグラウンド動作（Chrome ウィンドウが表示されない）
- ポップアップを base64 でキャプチャし、背景付き HTML に埋め込んで最終画像を生成
- 出力サイズ: 1280x800（Chrome Web Store 要件に準拠）
- クロスプラットフォーム対応（macOS/Windows/Linux）

カスタマイズ例（複数状態の撮影）:

```javascript
const states = [
  { name: "01-initial", state: "initial" },
  { name: "02-loading", state: "loading" },
  { name: "03-completed", state: "completed" },
];

for (const { name, state } of states) {
  const popupPage = await browser.newPage();
  await popupPage.goto(popupUrl, { waitUntil: "networkidle2" });
  await popupPage.evaluate((s) => {
    // DOM を操作して各状態を再現
  }, state);
  const popupScreenshot = await popupPage.screenshot({ encoding: "base64" });
  await popupPage.close();

  const wrapperPage = await browser.newPage();
  await wrapperPage.setViewport({ width: 1280, height: 800 });
  const html = createWrapperHtml(popupScreenshot, "Title", "Description");
  await wrapperPage.setContent(html);
  await wrapperPage.screenshot({ path: `${name}.png` });
  await wrapperPage.close();
}
```

### 8. ZIP 作成

```bash
npm run zip
```

## Phase 4: 公開

### 初回公開

1. [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) にログイン
2. ZIP をアップロード
3. スクリーンショット・説明文・プライバシーポリシー URL を設定
4. 審査提出（数日〜1 週間）

### 更新時の自動化（オプション）

初回公開後は CLI で自動化可能:

```bash
npm install -D chrome-webstore-upload-cli
```

詳細は [references/automation.md](references/automation.md) を参照。

## WXT 注意点

### ContentScriptContext の型

WXT の auto-import は `ContentScriptContext` を `const`（値）として登録する。型アノテーションには `InstanceType<typeof ContentScriptContext>` を使う:

```ts
export default defineContentScript({
  async main(ctx: InstanceType<typeof ContentScriptContext>) {
```

### Extension context invalidated エラー

拡張機能の更新時、古い content script が Chrome API を呼ぶと `Extension context invalidated` エラーが発生する。`ctx` を使ってリスナーのライフサイクルを管理する:

- `ctx.addEventListener(target, event, handler)`: context 無効化時に自動解除
- `ctx.onInvalidated(callback)`: `chrome.storage.onChanged` など Chrome API リスナーの手動解除に使用
- `ctx.isInvalid`: 非同期処理の各 `await` 後にガードとして使用

### ctx.addEventListener の型推論

`ctx.addEventListener(document, "keydown", handler)` のハンドラは `DocumentEventMap` 全体の union 型が推論される。`KeyboardEvent` に絞り込まれないため、ハンドラ内でキャストが必要:

```ts
ctx.addEventListener(document, "keydown", async (_e) => {
  const e = _e as KeyboardEvent;
```

## セキュリティ

### web_accessible_resources

`use_dynamic_url: true` を付ける。拡張機能のインストール有無を外部サイトから推測されるフィンガープリンティングを防ぐ。

```ts
web_accessible_resources: [
  {
    matches: ["<all_urls>"],
    resources: ["inject.js"],
    use_dynamic_url: true,
  },
],
```

### page context との通信

content script から inject script へ `postMessage` で `MessagePort` を渡す場合:

- content script 側で nonce (`crypto.randomUUID()`) を生成し、埋め込みコンフィグ経由で inject script に渡す
- inject script 側で `event.source === window` と nonce の一致を検証する
- `runtime.onMessage` をページに転送する場合、メッセージタイプをホワイトリストでフィルタする
- `chrome.storage` への書き込みを中継する場合、キーをホワイトリストで制限する

### ユーザー入力

- ユーザー入力から `new RegExp()` を生成しない（ReDoS リスク）
- ホスト名の比較には `.includes()` ではなく完全一致を使う

## 公開準備チェックリスト

- [ ] `npm run build` が通る
- [ ] `public/_locales/` に en と ja の messages.json がある
- [ ] プライバシーポリシー URL がある
- [ ] スクリーンショット（1280x800）がある（`npm run generate:screenshots` で生成可能）
- [ ] プロモーション画像（440x280）がある（`npm run generate:promo` で生成可能）
- [ ] `npm run zip` で ZIP が生成される
