# Extension Icon Design

Chrome 拡張機能のアイコンをデザイン・作成するガイド。

## 必須サイズ

| サイズ  | 用途                             |
| ------- | -------------------------------- |
| 16x16   | ツールバー、ファビコン           |
| 32x32   | Windows タスクバー（任意）       |
| 48x48   | 拡張機能管理ページ               |
| 128x128 | Chrome Web Store、インストール時 |

注意: Chrome 拡張では SVG を直接 manifest に指定できない。必ず PNG に変換する。

## デザイン原則

### 1. シンプルさが最優先

- 1 つのシンボルで 1 つのメッセージ
- 16px で認識できるシルエット
- 2-3 オブジェクト以内

### 2. シルエットテスト

アイコンを黒一色で塗りつぶしても認識できるか確認する。

### 3. 角丸（rx）

128x128 ベースで **rx=24**（18.75%）を推奨。Chrome 公式は 9.4% だが、実際の拡張機能では 18-22% が見栄え良い。

| サイズ  | rx  |
| ------- | --- |
| 128x128 | 24  |
| 16x16   | 3   |

### 4. 避けるべきパターン

| NG                       | 理由                         |
| ------------------------ | ---------------------------- |
| テキストを入れる         | 16px で読めない              |
| 複雑なディテール         | 小サイズで潰れる             |
| 重いドロップシャドウ     | 古臭く見える                 |
| 複数の光源               | 不自然に見える               |
| レインボーグラデーション | 時代遅れ                     |
| 過度な立体感             | スキューモーフィズム的で古い |

## SVG テンプレート

### フラットデザイン（推奨）

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#4F46E5"/>

  <g fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <!-- シンボルをここに -->
  </g>
</svg>
```

### シンボル例

Chevron（>>）:

```xml
<g fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M36 40 L56 64 L36 88"/>
  <path d="M68 40 L88 64 L68 88"/>
</g>
```

再生ボタン:

```xml
<polygon points="48,36 48,92 96,64" fill="white"/>
```

チェックマーク:

```xml
<path d="M32 64 L56 88 L96 40" fill="none" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
```

## 色の選び方

| 印象           | 色名    | Hex     |
| -------------- | ------- | ------- |
| エネルギッシュ | Rose    | #E11D48 |
| 信頼感         | Indigo  | #4F46E5 |
| 爽やか         | Teal    | #0D9488 |
| 落ち着き       | Slate   | #334155 |
| 成長           | Emerald | #059669 |
| 創造性         | Violet  | #7C3AED |

Chrome Web Store で同カテゴリの拡張機能を確認し、被らない色を選ぶ。

## PNG 変換

### rsvg-convert（推奨）

```bash
brew install librsvg
```

```bash
rsvg-convert -w 16 -h 16 icon.svg -o icon16.png
rsvg-convert -w 32 -h 32 icon.svg -o icon32.png
rsvg-convert -w 48 -h 48 icon.svg -o icon48.png
rsvg-convert -w 128 -h 128 icon.svg -o icon128.png
```

### ImageMagick

```bash
magick icon.svg -resize 16x16 icon16.png
magick icon.svg -resize 32x32 icon32.png
magick icon.svg -resize 48x48 icon48.png
magick icon.svg -resize 128x128 icon128.png
```

### qlmanage は使わない

macOS の `qlmanage -t -s SIZE` は**透明部分を白で塗りつぶす**。角丸アイコンの四隅が白くなるため、必ず `rsvg-convert` か `magick` を使うこと。

## 16px 最適化

16px は最も難しいサイズ。以下を確認:

- 線が太い（128px ベースで stroke-width: 8 以上）
- 要素が少ない
- ピクセルグリッドに整列

16px で潰れる場合は専用バージョンを作成:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <rect width="16" height="16" rx="3" fill="#4F46E5"/>
  <g fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4 L8 8 L4 12"/>
    <path d="M8 4 L12 8 L8 12"/>
  </g>
</svg>
```

## manifest.json への登録

```json
{
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png"
    }
  }
}
```

## ダークモード対応

ツールバーアイコンは Chrome のテーマによって背景が白にも黒にもなる。

対策:

- 白いアイコンには細い暗色アウトラインを追加
- 暗いアイコンには細い明色アウトラインを追加
- または半透明の影を追加

```xml
<g filter="url(#shadow)">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="0" stdDeviation="2" flood-opacity="0.3"/>
    </filter>
  </defs>
  <!-- アイコン本体 -->
</g>
```

## チェックリスト

- [ ] シルエットテストに合格
- [ ] 16px で認識できる
- [ ] 明るい/暗い背景両方で見える
- [ ] 同カテゴリの拡張機能と差別化できている
- [ ] PNG に変換済み（16, 32, 48, 128）

## 参考アイコンライブラリ

シンボルの参考に:

- [Heroicons](https://heroicons.com/)
- [Lucide](https://lucide.dev/)
- [Tabler Icons](https://tabler.io/icons)
