---
name: secrets
description: 1Password CLI (op) によるシークレット管理ガイド。API キーの取得・保管、GitHub Secrets の設定、1Password アイテムの作成・削除を行う。「API キーを取得」「シークレットを設定」「op item get」「1Password」「環境変数にキーを設定」などのリクエストで使用する。
---

# シークレット管理

API キーやトークンは 1Password CLI (`op`) で管理する。

## サービスアカウント

`OP_SERVICE_ACCOUNT_TOKEN` が環境変数にセット済み。指紋認証なしで `op` コマンドが使える。

- vault は Automation のみアクセス可能。`--vault Automation` 必須
- 読み取り専用。作成・編集・削除は `OP_SERVICE_ACCOUNT_TOKEN="" op ...` で実行 (指紋認証が出る)

## シークレットの保管ルール

- `settings.json` の `env` にシークレットを書かない (git 管理対象)
- `.env` / `.dev.vars` は使わない。`op item get` や `op run` で都度取得する
- `.zshrc` 等のシェル設定に `export SECRET=` を書かない
- 本番デプロイ: `wrangler secret put` や CI/CD で 1Password から取得して設定

## 1Password CLI の使用例

```bash
op item get "ITEM_NAME" --fields credential --reveal --vault Automation
op item get "ITEM_NAME" --format json --vault Automation | jq '.fields[] | {label, type}'
op item list --vault Automation
op run --env-file=.env.1password -- npm run dev
```

フィールド名は `credential` (API キー用) または `password` (ログイン用) が一般的。

注意:

- `op item get` で値を取得する際は `--reveal` フラグが必要
- `--vault Automation` を常に指定する (省略するとエラー)
- 同じアイテムを 2 回取得しない。一度取得したら変数に保存して再利用する
- `--category` の値は表示名そのまま (例: `"API Credential"`, `"Secure Note"`)
- アイテムの作成・編集・削除はサービスアカウントではできない

## 個人アカウントでの操作 (作成・編集・削除)

サービスアカウントを一時的に無効化し、個人アカウント (指紋認証) で実行:

```bash
OP_SERVICE_ACCOUNT_TOKEN= op item delete "ITEM_NAME" --vault Automation
OP_SERVICE_ACCOUNT_TOKEN= op item create --category "API Credential" --title "NAME" --vault Automation
```

## GitHub Secrets

`gh secret set SECRET_NAME --repo owner/repo --body "value"` で設定。

### Cloudflare Workers デプロイ用

1Password アイテム「GitHub Actions - Cloudflare Workers」に `credential` (API トークン) と `account_id` が格納:

```bash
gh secret set CLOUDFLARE_API_TOKEN --body "$(op item get 'GitHub Actions - Cloudflare Workers' --fields credential --reveal)"
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$(op item get 'GitHub Actions - Cloudflare Workers' --fields account_id --reveal)"
```

## 主要キー名一覧

インフラ:

- `GitHub Actions - Cloudflare Workers` - Cloudflare Workers デプロイ用
- `GitHub Actions - Fly.io` - Fly.io デプロイ用
- `CLOUDFLARE_GLOBAL_API_KEY` - Cloudflare グローバル API キー
- `HF_TOKEN` - Hugging Face CLI 認証用
- `GITHUB_TOKEN` - GitHub API 用

AI/LLM:

- `ANTHROPIC_API_KEY` - Claude API
- `OPENAI_API_KEY` - OpenAI API
- `OPENROUTER_API_KEY` - OpenRouter API
- `GOOGLE_AI_STUDIO_API_KEY` - Google AI Studio
- `XAI_API_KEY` - xAI API

メール:

- `RESEND_API_KEY_*` - Resend (プロジェクト別に複数あり)

決済:

- `Stripe Test API Keys (*)` - Stripe テスト用
- `Stripe Live API Keys` - Stripe 本番用
