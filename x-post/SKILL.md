---
name: x-post
description: xurl CLI を使って X (Twitter) にポストする。ツイート投稿、リプライ、引用ポストに使用する。「X にポストして」「ツイートして」などのリクエストで使用する。
---

# X ポストスキル (xurl)

xurl CLI を使って X (Twitter) にポストする。

このスキルはポスト投稿専用。検索、タイムライン閲覧、リード等には使わない。xurl は X API (有料、高額) を使用するため、API コールは最小限にする。X の閲覧・検索が必要な場合は chrome-devtools MCP を使う。

## 前提条件

- xurl がインストール済み (`brew install --cask xdevplatform/tap/xurl`)
- OAuth 2.0 認証済み (`xurl auth status` で確認)
- 未認証の場合は `xurl auth oauth2` でブラウザ認証が必要（ユーザーに案内する）

## 主要コマンド

### ポスト投稿

```bash
xurl post "投稿テキスト"
```

改行を含む場合は JSON API を使う:

```bash
xurl -X POST /2/tweets -d '{"text":"1行目\n2行目"}'
```

### リプライ

```bash
xurl reply <tweet_id> "リプライテキスト"
```

### 引用ポスト

```bash
xurl quote <tweet_id> "引用コメント"
```

### いいね / リポスト

```bash
xurl like <tweet_id>
xurl repost <tweet_id>
```

### ポスト読み取り

```bash
xurl read <tweet_id>
```

### 検索

```bash
xurl search "検索クエリ" -n 20
```

### タイムライン / メンション

```bash
xurl timeline
xurl mentions
```

### DM

```bash
xurl dm @username "メッセージ"
```

### メディア付き投稿

```bash
xurl media upload path/to/image.jpg
```

アップロード後に返される media_id を使って投稿:

```bash
xurl -X POST /2/tweets -d '{"text":"テキスト","media":{"media_ids":["MEDIA_ID"]}}'
```

### ユーザー情報

```bash
xurl whoami
xurl user @username
```

### フォロー / ブロック / ミュート

```bash
xurl follow @username
xurl unfollow @username
xurl block @username
xurl mute @username
```

### ポスト削除

```bash
xurl delete <tweet_id>
```

## ワークフロー

### 単純なテキスト投稿

1. ユーザーから投稿内容を受け取る
2. 投稿内容を確認表示する
3. ユーザーの承認を得てから `xurl post` で投稿
4. 投稿結果の URL を表示: `https://x.com/<username>/status/<tweet_id>`

### 改行を含む投稿

改行を含む場合は `xurl post` ではなく JSON API を使う:

```bash
xurl -X POST /2/tweets -d '{"text":"1行目\n2行目\n3行目"}'
```

### メディア付き投稿

1. `xurl media upload <filepath>` でアップロード
2. 返された media_id を使って投稿

## 重要な注意事項

- ポスト投稿・削除など不可逆な操作は必ずユーザーの承認を得てから実行する
- 投稿内容はそのまま公開されるため、誤字脱字がないか確認を促す
- API レート制限に注意（短時間の連続投稿は避ける）
- xurl のエラー時は `xurl auth status` で認証状態を確認する
