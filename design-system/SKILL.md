---
name: design-system
description: |
  デザインシステムの新規構築と既存ルールの強制を行う。トークン設計、コンポーネント設計、
  プロジェクトセットアップ、日本語タイポグラフィをガイドする。
  「デザインシステムを作りたい」「DS を構築」「コンポーネントライブラリを作る」
  「トークンを設計」「デザインシステムに従って」などのリクエストで使用する。
---

# Design System Skill

デザインシステムの構築から運用までをガイドするスキル。2 つのモードで動作する。

## モード

### 構築モード

プロジェクトに `.design-system/system.md` が存在しない場合に適用。
トークン設計 -> 技術選定 -> プロジェクト初期化 -> コンポーネント実装の順にガイドする。
各フェーズの決定事項を `.design-system/system.md` に記録し、次のフェーズへ進む。

### 強制モード

プロジェクトに `.design-system/system.md` が存在する場合に適用。
ファイルに記録されたトークン、パターン、技術スタックに従ってコーディングを強制する。

## モード検出

1. プロジェクトルートで `.design-system/system.md` を探す
2. 存在する場合: 読み込んで強制モードへ
3. 存在しない場合: ユーザーに確認して構築モードへ

---

## 構築モード

### Phase 1: UI インベントリ(既存プロダクトがある場合)

既存プロダクトがある場合のみ実施。新規の場合は Phase 2 へ。

1. 既存の UI をカテゴリ別に分類する(ボタン、フォーム、ナビゲーション、カード等)
2. 同じ役割で見た目が異なる要素(矛盾)を洗い出す
3. 使用頻度と重要度でランク付けする
4. 統合すべき要素を特定する

出力: 矛盾リストと優先コンポーネントリストをユーザーに提示。

### Phase 2: デザイン原則

ユーザーと対話して 3-5 個のデザイン原則を策定する。

質問する内容:

- プロダクトの性格は?(堅実/遊び心/ミニマル/情報密度高め等)
- 対象ユーザーは?(エンジニア/一般消費者/業務担当者等)
- 避けたい印象は?
- 参考にしたい既存のプロダクトやデザインシステムは?

各原則に Do/Don't の具体例を添える。

出力例:

```
1. 明確さ優先 - 装飾より情報の伝達を優先する
   Do: ラベルを省略しない、エラー原因と対処法を両方伝える
   Don't: アイコンだけで意味を伝えようとしない
```

決定内容を `.design-system/system.md` の Design Principles セクションに記録。

### Phase 3: トークン設計

`references/token-design.md` を参照して以下を決定する。

決定事項:

1. カラーパレット(Primitive 色 + Semantic マッピング + ダークモード)
2. タイポグラフィスケール(ベースサイズ、比率、日本語フォント)
3. スペーシングスケール(4px/8px grid)
4. エレベーション(シャドウ 5 段階)
5. ブレークポイント
6. ボーダー(radius、width)

ユーザーにカラー候補を提示する際は、既存ブランドカラーがあるか確認する。
日本語フォントは `references/japanese-typography.md` を参照。

出力フォーマット(DTCG JSON):

```json
{
  "color": {
    "primitive": {
      "blue-500": { "$type": "color", "$value": "#3b82f6" }
    },
    "semantic": {
      "primary": { "$type": "color", "$value": "{color.primitive.blue-500}" }
    }
  }
}
```

決定内容を `.design-system/system.md` の Tokens セクションに記録。

### Phase 4: 技術スタック選定

`references/tech-stack-guide.md` を参照し、ユーザーと対話して決定する。

決定事項:

1. UI フレームワーク(React / Vue / Svelte / フレームワーク非依存)
2. スタイリング(Tailwind CSS v4 / Vanilla Extract / Panda CSS / CSS Modules)
3. Headless UI 基盤(Radix UI / React Aria / Ark UI)
4. バリアント管理(CVA / Tailwind Variants)
5. ビルドツール(tsdown / Vite library mode)
6. モノレポツール(pnpm workspaces + Turborepo)
7. ドキュメント(Storybook 10)
8. テスト(Vitest + Testing Library)

ユーザーの経験や好みに合わせて推奨構成を提案する。
迷った場合のデフォルト推奨: React + Tailwind v4 + Radix UI + CVA + tsdown + pnpm + Turborepo

決定内容を `.design-system/system.md` の Tech Stack セクションに記録。

### Phase 5: プロジェクト初期化

`references/project-setup.md` を参照してモノレポを構築する。

```
design-system/
  apps/
    docs/              # Storybook
  packages/
    tokens/            # DTCG JSON + Style Dictionary
    components/        # UI コンポーネント
    icons/             # SVG -> コンポーネント変換
  pnpm-workspace.yaml
  turbo.json
  package.json
```

各パッケージの初期ファイルを生成:

- `packages/tokens/`: Phase 3 で決定したトークンを DTCG JSON で配置、Style Dictionary 設定
- `packages/components/`: Headless UI + バリアント管理のベース設定
- `packages/icons/`: SVG 変換パイプライン
- `apps/docs/`: Storybook 設定

### Phase 6: コンポーネント実装

`references/component-patterns.md` を参照してコンポーネントを実装する。

推奨実装順:

1. 基盤ユーティリティ: `cn()` ヘルパー、型定義
2. Button(バリアント管理のリファレンス実装)
3. Input, TextArea, Select(フォーム要素)
4. Card, Badge, Avatar(表示要素)
5. Dialog, Popover, Tooltip(オーバーレイ)
6. Tabs, Accordion(インタラクティブ)

各コンポーネントの実装時に守ること:

- Headless UI 基盤の振る舞い層とスタイル層を分離する
- バリアントは CVA/Tailwind Variants で型安全に定義する
- HTML ネイティブ属性を透過する(`...rest` props)
- ARIA 属性とキーボードナビゲーションを含める
- Storybook ストーリーを同時に作成する

### Phase 7: ドキュメント

Storybook のセットアップと拡張:

- Autodocs で Props テーブルを自動生成(`tags: ['autodocs']`)
- MDX でガイドラインページを作成(デザイン原則、トークン一覧、使い方)
- a11y addon でアクセシビリティチェックを常時実行
- Interactions addon でインタラクションテストを統合

ドキュメントサイトが必要な場合は Astro Starlight を推奨。

### Phase 8: 配布

npm パッケージとしての公開準備:

- `package.json` の `exports` フィールドで ESM エントリを定義
- `"sideEffects": false` で Tree-shaking を有効化
- Changesets でバージョニングとリリースノートを管理
- GitHub Actions で CI/CD パイプラインを構築

MCP サーバー化(オプション):
デザインシステムのトークンとコンポーネント情報を MCP 経由で AI エージェントに公開する。
日本企業の先行事例: Spindle MCP, kamii-mcp, MFUI MCP

---

## 強制モード

`.design-system/system.md` が存在する場合、以下のルールを適用する。

### トークン準拠

- ハードコードされた色値(`#xxx`, `rgb()`)を使わない。トークン経由で参照する
- スペーシングはトークンで定義されたスケール値のみ使用する
- タイポグラフィはトークンで定義されたフォント、サイズ、行間のみ使用する
- system.md に定義されていない値を使う場合はユーザーに確認し、承認後に system.md を更新する

### コンポーネントパターン準拠

- system.md で指定された Headless UI ライブラリを基盤にする
- バリアントは指定されたツール(CVA/Tailwind Variants)で管理する
- 新しいコンポーネントは既存パターンに従って実装する
- Compound Components パターンで構成する(props の羅列を避ける)

### 日本語タイポグラフィ準拠

`references/japanese-typography.md` と system.md の Japanese Typography セクションに従う:

- 指定フォントファミリを使用する
- 本文の line-height は指定値以上を維持する
- 全角・半角の混在ルールに従う

### 逸脱時の対応

ルールから逸脱する必要がある場合:

1. 逸脱の理由を説明する
2. ユーザーの承認を得る
3. 承認された場合、system.md に例外として記録する

---

## 永続化: .design-system/system.md

構築モードの各フェーズで決定した内容を以下のフォーマットで保存する。
強制モードではこのファイルを読み込んでルールを適用する。

```markdown
# Design System: [project-name]

## Design Principles

1. [原則名] - [説明]
   Do: [具体例]
   Don't: [具体例]

## Tokens

### Colors

- primitive: { blue-500: #3b82f6, ... }
- semantic: { primary: blue-500, background: white, ... }
- dark: { background: gray-900, ... }

### Typography

- font-family: "Noto Sans JP", sans-serif
- base-size: 16px
- scale-ratio: 1.25
- sizes: { xs: 10px, sm: 13px, base: 16px, lg: 20px, xl: 25px, 2xl: 31px }

### Spacing

- base: 4px
- scale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80]

### Elevation

- level-0: none
- level-1: 0 1px 2px rgba(0,0,0,0.05)
- level-2: 0 4px 6px rgba(0,0,0,0.07)
- level-3: 0 10px 15px rgba(0,0,0,0.1)
- level-4: 0 20px 25px rgba(0,0,0,0.15)

### Border

- radius: { sm: 4px, md: 8px, lg: 12px, full: 9999px }

### Breakpoints

- sm: 640px, md: 768px, lg: 1024px, xl: 1280px

## Component Patterns

- headless-base: Radix UI
- variant-tool: CVA
- styling: Tailwind CSS v4
- component-style: Compound Components

## Tech Stack

- framework: React
- styling: Tailwind CSS v4
- build: tsdown
- monorepo: pnpm + Turborepo
- docs: Storybook 10
- test: Vitest + Testing Library
- versioning: Changesets

## Japanese Typography

- font: "Noto Sans JP", sans-serif
- line-height-body: 1.7
- line-height-heading: 1.3
- letter-spacing: 0.03em

## Exceptions

(ルールからの逸脱を記録)
```

---

## References

- [トークン設計ガイド](references/token-design.md) - DTCG 仕様、3 層構造、カラー/タイポグラフィ/スペーシング設計
- [コンポーネントパターン](references/component-patterns.md) - Headless UI、Compound Components、CVA、a11y
- [技術選定ガイド](references/tech-stack-guide.md) - 2026 年版ツール比較と推奨スタック
- [プロジェクトセットアップ](references/project-setup.md) - モノレポ構成、ビルド設定、配布テンプレート
- [日本語タイポグラフィ](references/japanese-typography.md) - フォント選定、行間、全角半角ルール、文言ガイドライン
