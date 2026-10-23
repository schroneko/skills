---
name: secrets
description: 1Password Environments とデスクトップアプリ認証によるシークレット管理ガイド。API キー、credential、token、環境変数、GitHub Secrets の取得・登録・検証を安全に行う。
---

# シークレット管理

API キーやトークンは既存の 1Password Environment `.env` に保存し、stable 版 1Password CLI とデスクトップアプリ連携による本人認証で読み取る。

## 構成

- Environment ID: `~/.config/op/environment-id`
- シェル変数: `OP_ENVIRONMENT_ID`（`~/.zshenv` で Environment ID を読み込む）
- 認証: 1Password デスクトップアプリ連携と本人によるロック解除や Touch ID
- vault access: なし
- Environment access: `.env` の読み取り

Environment はシークレットの保管先であり、認証主体とは別に扱う。サービスアカウントは使用しない。新たな明示指示なしにサービスアカウントやトークンを作成、再利用、復元しない。

## 禁止事項

- `op item list`、`op item get`、`op item create`、`op item delete` を使わない
- `op://` vault secret reference や `.env.1password` を作らない
- `op signin` は使わない。本人認証が必要なときはデスクトップアプリでの承認を依頼し、サービスアカウントへ切り替えない
- Keychain、リポジトリ、同期フォルダ、シェル設定へ secret 値を書かない
- secret 値、部分値、長さ、エンコード表現を出力しない
- Environment 対応 CLI が使えないときに vault item へフォールバックしない
- 独自 alias や wrapper、リポジトリ内の `.op-environment-id` を作らない

## 実行前確認

実行中の 1Password CLI のバージョンと `op run` の `--environment` 対応、認証主体を確認する。stable 版 2.41.0 以降で `op run --environment` を利用できる。`op environment read` は beta 限定の別コマンドであり、Environment 利用の前提にしない。Environment 利用のために beta 版へ切り替えない。[公式手順](https://www.1password.dev/environments/read-environment-variables)

```sh
op --version
op run --help
op whoami --format json
```

`op whoami` の結果からデスクトップアプリ連携による本人認証を確認し、`SERVICE_ACCOUNT` を必須としない。失敗時は次を確認し、本人の承認が必要ならその操作を具体的に依頼して停止する。

- 1Password デスクトップアプリの CLI 連携とロック状態
- `~/.config/op/environment-id` と `OP_ENVIRONMENT_ID` の読み込み
- 実行される CLI が stable 版で `op run --environment` に対応していること

認証情報や Environment の内容を出力しない。継承されたサービスアカウント設定が見つかっても、その認証で実行せず、現行の本人認証との不一致を報告する。

## Environment の利用

Environment 全体へのアクセス確認は値を表示せずに行う。

```sh
op run --environment "$OP_ENVIRONMENT_ID" -- true
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
