---
name: secrets
description: 1Password Environments とサービスアカウントによるシークレット管理ガイド。API キー、credential、token、環境変数、GitHub Secrets の取得・登録・検証を安全に行う。
---

# シークレット管理

API キーやトークンは既存の 1Password Environment `.env` に保存し、Mac Studio では汎用サービスアカウント `mac-studio-development` から読み取る。

## 構成

- Environment ID: `~/.config/op/environment-id`
- サービスアカウントトークン: `~/.config/op/service-account-token`
- トークンファイル権限: `600`
- シェル変数: `OP_ENVIRONMENT_ID`、`OP_SERVICE_ACCOUNT_TOKEN`
- vault access: なし
- Environment access: `.env` の読み取り

Environment がシークレットの保管先であり、サービスアカウントは読み取り用の認証主体にすぎない。変数をサービスアカウントへ移す手順は存在しない。

## 禁止事項

- `op item list`、`op item get`、`op item create`、`op item delete` を使わない
- `op://` vault secret reference や `.env.1password` を作らない
- `op signin`、Touch ID、1Password app integration へ切り替えない
- Keychain、リポジトリ、同期フォルダ、シェル設定へ secret 値を書かない
- secret 値、部分値、長さ、エンコード表現を出力しない
- Environment 対応 CLI が使えないときに vault item へフォールバックしない

## 実行前確認

実行中の 1Password CLI が Environments 対応 beta build であることを確認する。

```sh
op environment --help
op run --help
op whoami --format json
```

`op whoami` は `SERVICE_ACCOUNT` を返す必要がある。失敗時は次を確認して停止する。

- `~/.config/op/service-account-token` が存在し、権限が `600`
- `~/.zshenv` が `OP_SERVICE_ACCOUNT_TOKEN` を読み込んでいる
- `op environment` と `op run --environment` が利用できる CLI build

## Environment の利用

Environment 全体へのアクセス確認は値を表示せずに行う。

```sh
op environment read "$OP_ENVIRONMENT_ID" >/dev/null
```

コマンドへ変数を注入する。

```sh
op run --environment "$OP_ENVIRONMENT_ID" -- <command>
```

特定変数の存在だけを確認する場合も値を出力しない。

```sh
op run --environment "$OP_ENVIRONMENT_ID" -- sh -c 'test -n "$OPENAI_API_KEY"'
```

## 追加・更新

Environment 変数の追加・更新は `$onepassword-environment-secrets` を使う。既存変数名を確認してから追加し、重複を作らない。完了後は変数名とアクセス成功だけを報告する。

## GitHub Secrets

ユーザーが対象 repository と変数名を明示して登録を依頼した場合だけ、Environment から対象プロセスへ注入して設定する。

```sh
op run --environment "$OP_ENVIRONMENT_ID" -- sh -c 'printf "%s" "$OPENAI_API_KEY" | gh secret set OPENAI_API_KEY --repo owner/repo'
```

値は標準出力、ログ、チャットへ出さない。

## Cloudflare

Cloudflare の認証には 1Password、`op run`、`CLOUDFLARE_API_TOKEN` を使わない。mise 管理の Wrangler と既存 OAuth セッションだけを使い、実行前に `wrangler whoami` で確認する。ローカル Worker へアプリ用 runtime secret を注入する場合だけ `op run --environment` を使い、必要な変数だけを binding 名へ割り当ててから `OP_SERVICE_ACCOUNT_TOKEN` と `OP_ENVIRONMENT_ID` を子プロセス環境から除く。
