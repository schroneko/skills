---
name: zenn-cli
description: Zenn の記事・本を作成・管理・プレビューする。「記事を書きたい」「本を作成して」「Zenn の記事一覧」「プレビューして」などのリクエストで使用する。zenn new:article, new:book, preview, list:articles, list:books コマンドをカバーする。
---

# zenn-cli

Zenn のコンテンツを管理する CLI ツール。

## コマンド一覧

| コマンド             | 説明                         |
| -------------------- | ---------------------------- |
| `zenn new:article`   | 新しい記事を作成             |
| `zenn new:book`      | 新しい本を作成               |
| `zenn preview`       | ブラウザでプレビュー         |
| `zenn list:articles` | 記事一覧を表示               |
| `zenn list:books`    | 本一覧を表示                 |
| `zenn init`          | 初期セットアップ（初回のみ） |

## 記事の作成

### 基本

```bash
zenn new:article
```

### オプション指定

```bash
zenn new:article --slug my-article-slug --title "記事タイトル" --type tech --emoji "📝"
```

| オプション           | 説明                                             |
| -------------------- | ------------------------------------------------ |
| `--slug`             | スラッグ（12-50 文字、`a-z0-9`、`-`、`_`）       |
| `--title`            | タイトル                                         |
| `--type`             | `tech`（技術記事）または `idea`（アイデア記事）  |
| `--emoji`            | アイキャッチ絵文字（1 文字）                     |
| `--published`        | 公開設定（`true` / `false`）。デフォルト `false` |
| `--publication-name` | Publication 名（紐付ける場合のみ）               |
| `--machine-readable` | 成功時にファイル名のみ出力                       |

### 記事ファイルの構造

```
articles/
├── my-article-slug.md
└── another-article.md
```

### 記事の frontmatter

```yaml
---
title: "記事タイトル"
emoji: "📝"
type: "tech"
topics: ["javascript", "react"]
published: false
published_at: 2024-01-15 09:00
---
```

| フィールド     | 説明                                                    |
| -------------- | ------------------------------------------------------- |
| `title`        | 記事タイトル                                            |
| `emoji`        | アイキャッチ絵文字（1 文字）                            |
| `type`         | `tech` または `idea`                                    |
| `topics`       | タグ配列（最大 5 つ）                                   |
| `published`    | `true` で公開、`false` で下書き                         |
| `published_at` | 公開日時（`YYYY-MM-DD` または `YYYY-MM-DD hh:mm`、JST） |

## 本の作成

### 基本

```bash
zenn new:book --slug my-book-slug
```

| オプション    | 説明                                        |
| ------------- | ------------------------------------------- |
| `--slug`      | スラッグ（12-50 文字）                      |
| `--title`     | タイトル                                    |
| `--published` | 公開設定（`true` / `false`）                |
| `--summary`   | 紹介文                                      |
| `--price`     | 価格（0: 無料、200-5000: 有料、100 円刻み） |

### 本のディレクトリ構造

```
books/
└── my-book-slug/
    ├── config.yaml
    ├── cover.png
    ├── chapter1.md
    └── chapter2.md
```

### config.yaml

```yaml
title: "本のタイトル"
summary: "本の紹介文"
topics: ["topic1", "topic2"]
published: true
price: 0
chapters:
  - chapter1
  - chapter2
toc_depth: 2
```

### チャプターの frontmatter

```yaml
---
title: "チャプタータイトル"
free: true
---
```

`free: true` で有料本の中の無料公開チャプター。最大 100 チャプター。

## プレビュー

```bash
zenn preview
zenn preview --port 3000
zenn preview --open
```

| オプション     | 説明                          |
| -------------- | ----------------------------- |
| `--port`, `-p` | ポート番号（デフォルト 8000） |
| `--no-watch`   | ホットリロード無効化          |
| `--open`       | 起動時にブラウザを開く        |
| `--host`       | ホスト名                      |

## 一覧表示

```bash
zenn list:articles
zenn list:articles --format json
zenn list:books --format tsv
```

`--format`: `tsv` または `json`

## スラッグの命名規則

- 12-50 文字
- 使用可能: `a-z`（小文字）、`0-9`、`-`（ハイフン）、`_`（アンダースコア）

## 公開

GitHub リポジトリに push すると自動デプロイ。コミットメッセージに `[ci skip]` または `[skip ci]` を含めるとデプロイをスキップ。
