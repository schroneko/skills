---
name: x-web-api
description: ログイン済み Chrome の X セッションを macOS 上で安全に読み取り、CDP やブラウザ UI を使わず X の内部 Web API を直接呼ぶ。X の creator subscription、following、相互関係、viewer identity の読み取りや、相手からフォローされていない一方的フォローだけの解除を行う。「X の内部 API で一覧を取得して」「一方的にフォローしている人だけ解除して」「サブスク中を除いて非相互フォローを解除して」などの依頼で使用する。
---

# X Web API

CDP、`evaluate_script`、ブラウザ UI に依存せず、macOS の Chrome Cookie DB にある `.x.com` の `auth_token` と `ct0` だけをメモリ内で復号し、X の内部 Web API を直接呼ぶ。

## Requirements

- macOS
- Chrome の `Default` profile で X にログイン済み
- Node.js 24 以上
- Chrome Safe Storage への Keychain 読み取り許可

helper は Cookie、復号鍵、Authorization header を標準出力、引数、環境変数、計画ファイル、checkpoint に出さない。Chrome Cookie DB は read-only で開き、`.x.com` の `auth_token` と `ct0` 以外を読まない。

## Keychain Approval

初回実行時は macOS の Keychain 許可ダイアログが表示される可能性がある。画面へ影響するため、helper を初めて実行する前にユーザーへ説明し、明示承認を得る。許可する場合は `Allow Once` を使い、`Always Allow` は選ばない。

## Read-only Commands

`<skill-dir>` はこの `SKILL.md` のディレクトリ。

```bash
mise exec node@lts -- node <skill-dir>/scripts/x-web-api.mjs viewer \
  --expected-handle HANDLE
```

```bash
mise exec node@lts -- node <skill-dir>/scripts/x-web-api.mjs creator-subscriptions \
  --expected-handle HANDLE \
  --expected-subscriptions COUNT
```

`creator-subscriptions` は X の公開 Web bundle から `UserCreatorSubscriptions` の現行 query ID と feature switches を実行時に検出する。operation metadata の field toggles も検証するが、現行 Web と同様に request へは送らない。query ID を固定値として信用しない。

## Unfollow Planning

フォロー解除は必ず読み取り専用の計画作成から始める。

```bash
mise exec node@lts -- node <skill-dir>/scripts/x-web-api.mjs plan-unfollow-non-mutual-except-subscriptions \
  --expected-handle HANDLE \
  --expected-subscriptions COUNT \
  --output /absolute/path/unfollow-plan.json
```

計画には viewer、creator subscription 全件、following 全件、`friendships/lookup` で確認した相互関係、対象の x.com URL、件数、digest が含まれる。対象条件は `following = true`、`followed_by = false`、creator subscription ではない、の 3 条件すべてを満たすユーザーだけとする。

1. viewer handle が依頼対象と一致する。
2. subscription 件数が UI などで事前確認した件数と一致する。
3. `following_count = mutual_count + unilateral_count` が成り立つ。
4. `target_count = unilateral_count - retained_unilateral_subscription_count` が成り立つ。
5. unresolved user がある場合は ID と `https://x.com/i/user/<ID>` を示す。
6. ユーザーへ相互フォロー保持件数、subscription 保持件数、解除対象件数、計画ファイルを提示し、この正確な件数に対する最終承認を得る。

計画作成ではフォロー解除を 1 件も実行しない。

## Unfollow Execution

最終承認後だけ `--execute` を付ける。`--confirm-count` は承認された計画の `target_count` と完全一致させる。

```bash
mise exec node@lts -- node <skill-dir>/scripts/x-web-api.mjs apply-unfollow-plan \
  --plan /absolute/path/unfollow-plan.json \
  --checkpoint /absolute/path/unfollow-checkpoint.json \
  --expected-handle HANDLE \
  --confirm-count COUNT \
  --max-actions 10 \
  --execute
```

helper は各 chunk の直前に viewer、subscription 集合、対象 10 件の相互関係を再取得する。`followed_by = true` に変わったユーザーは解除せず `protected_mutual_ids` に記録する。既に `following = false` のユーザーは完了済みとして扱う。

- 1 回の実行は最大 10 件。
- 各書き込みの間は 800 ms 空ける。
- chunk 間は 50〜65 秒空ける。
- 401、403 は即停止する。
- 429 は `x-rate-limit-reset` を checkpoint に記録して停止する。
- 成功前の最初の 404 は endpoint または対象不整合として停止する。
- 成功後の burst 404 は retryable として checkpoint に残す。
- 200 でも返却 user ID が対象 ID と違う場合は停止する。

長い待機は helper 内で行わない。checkpoint を使って chunk ごとに再実行する。

## Verification

全 chunk 完了後に再検証する。

```bash
mise exec node@lts -- node <skill-dir>/scripts/x-web-api.mjs verify-unfollow-plan \
  --plan /absolute/path/unfollow-plan.json \
  --checkpoint /absolute/path/unfollow-checkpoint.json \
  --expected-handle HANDLE
```

`complete: true`、`remaining_target_count: 0`、subscription 集合の一致を確認してから完了報告する。

## Safety Rules

- 書き込み前に `--expected-handle` と viewer identity を必ず照合する。
- dry-run の計画と明示的な `--execute` を分離する。
- `following = true` と `followed_by = false` を計画時と各書き込み直前の両方で確認する。
- 相互フォローは対象件数に関係なく解除しない。
- 任意 URL や任意 endpoint を CLI から受け取らない。
- user ID は文字列として扱う。
- 計画 digest、viewer、target count が不一致なら停止する。
- creator subscription の既定リストや過去の手動リストを現在の課金状態の根拠にしない。
- X のレスポンス形状や operation が変わった場合は推測で継続せず停止する。
