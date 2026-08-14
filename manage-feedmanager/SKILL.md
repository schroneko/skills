---
name: manage-feedmanager
description: FeedManager の feed を first-party operator CLI で確認・管理する。登録 feed の一覧、article/feed URL の対応と exact/canonical 登録判定、feed の追加、配信 channel の更新、削除、明示的な手動 check、AnyToSummary と Discord までの配信診断を行う。「この URL は対応してる？」「登録済み？」「未登録なら追加」「feed 一覧」「別 channel へ移動」「削除」「今すぐ check」「記事が流れてこない」などの依頼で使用する。
---

# Manage FeedManager

FeedManager リポジトリの first-party operator CLI だけを使い、feed の状態確認と管理を安全に行う。Discord の `/add`、管理画面の DOM 操作、直接の HTTP request、remote D1 への raw write は使わない。

## Prepare

1. `${GHQ_ROOT:-$HOME/ghq}/github.com/schroneko/feedmanager` を作業ディレクトリにする。
2. `package.json` に `manage-feeds` script があり、`README.md` の operations CLI contract と一致することを確認する。
3. `OPERATIONS_TOKEN` は引数や出力へ書かず、1Password Environment から注入する。

CLI は固定済みの production origin だけへ接続し、redirect を拒否する。任意 origin へ token を送る fallback を作らない。
対象 URL に userinfo、署名、token、secret query が含まれる場合は CLI へ渡さず、公開 canonical URL を確認して使う。公開 canonical URL を確認できない場合は推測せず停止する。

## Choose the operation

- 質問、調査、配信確認では `resolve`、`list`、`status`、`channels`、`diagnose` だけを使う。
- 「追加して」「移動して」「削除して」「今すぐ check」のような明示依頼がある場合だけ mutation を行う。
- mutation は常に plan を先に取得し、内容と digest を確認してから同じ引数で apply する。
- guild や channel を一意に決められない場合は、読み取り結果を提示して選択を求める。推測で選ばない。

## Inspect feeds and channels

```bash
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- list --guild-id "$GUILD_ID" --json
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- list --guild-id "$GUILD_ID" --domain example.com --errors-only --json
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- status --feed-id "$FEED_ID" --json
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- channels --guild-id "$GUILD_ID" --json
```

`status` では URL、channel、notification 設定、poll error、pending job、post 件数を確認する。notification が無効な feed を「届くか試す」目的で check しない。新着を既読化して Discord へ送らないためである。

## Resolve a URL

article URL と feed URL のどちらでも `resolve` を最初に使う。

```bash
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- resolve --url "$TARGET_URL" --guild-id "$GUILD_ID" --json
```

status を次のように扱う。

- `exact_registered`: fragment 除去などの安全な正規化後の入力 URL が登録済み。
- `canonical_registered`: redirect や決定的変換後の同一 feed が登録済み。
- `candidate_registered`: 記事の配信元候補が登録済み。
- `unregistered`: 対応候補はあるが登録されていない。
- `ambiguous`: 複数候補がある。自動選択しない。
- `unsupported`: 根拠のある feed 候補を解決できない。

末尾 slash の違いだけで同一 feed と決めない。resolver が redirect final URL または parsed feed の根拠で返した判定を使う。

## Diagnose delivery

特定記事が流れたか、どこで止まったかは guild を付けて診断する。

```bash
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- diagnose --url "$ARTICLE_URL" --guild-id "$GUILD_ID" --json
```

feed が一意に解決できない場合は `--feed-id "$FEED_ID"` も付ける。`sentUrl`、`notificationJob`、`summaryAttempt`、`newsItem`、`upstreamItem`、`feedHealth`、`cronEffective` と `state` を合わせて読む。`notificationJob` が存在しないことだけを配信完了の根拠にしない。正常完了時にも job は削除される。

`state` は証拠の優先順位から得た診断結果として扱う。登録済み feed の未配信では重複追加せず、各 evidence と `nextSafeAction` を照合する。
`upstream_unavailable` は現在の取得に失敗して診断できない状態であり、`article_not_seen` と扱わない。manual check を作らず、upstream 復旧後に diagnose をやり直す。
`article_not_in_current_feed` は取得できた現在の feed snapshot に対象記事がない状態である。manual check では backfill できないため apply せず、source URL と feed の保持範囲を確認する。

## Add a feed

追加が明示され、`resolve` が `unregistered` を返した場合、または `ambiguous` でユーザーが候補を選んだ場合だけ plan を作る。`ambiguous` では resolver が返した候補の一つを `--candidate-url` で明示する。

```bash
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- add --url "$TARGET_URL" --guild-id "$GUILD_ID" --channel-id "$CHANNEL_ID" --json
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- add --url "$TARGET_URL" --guild-id "$GUILD_ID" --channel-id "$CHANNEL_ID" --apply --expected-digest "$DIGEST" --json
```

plan の `activeDuplicate`、`deletedHistory`、`selectedCandidate`、`initialItemCount`、`targetInInitialSnapshot`、`willDeliverTargetNow` を確認する。

- `activeDuplicate.exists=true` なら apply しない。
- 最初の探索 plan は `--allow-readd` なしで取得する。`deletedHistory.exists=true` なら apply せず停止する。保存 URL と現在の redirect final URL が異なる削除履歴も同じ判定になる。ユーザーがその削除済み feed の再登録を明示した後、新しい plan と apply の両方へ `--allow-readd` を付ける。
- `willDeliverTargetNow=false` は既存仕様である。登録時点の item は seed されるため、対象の既刊記事は backfill されない。「登録できた」を「その記事を配信した」と報告しない。
- initial snapshot が storage limit で 422 になった場合は apply や直接 DB 登録へ迂回せず、登録不能として報告する。

## Update, remove, and check

channel update:

```bash
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- update --feed-id "$FEED_ID" --guild-id "$GUILD_ID" --channel-id "$CHANNEL_ID" --json
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- update --feed-id "$FEED_ID" --guild-id "$GUILD_ID" --channel-id "$CHANNEL_ID" --apply --expected-digest "$DIGEST" --json
```

`movablePendingJobs` は新 channel へ移り、`fixedInFlightJobs` は旧 channel のままである。plan の両方を確認する。

remove:

```bash
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- remove --feed-id "$FEED_ID" --guild-id "$GUILD_ID" --json
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- remove --feed-id "$FEED_ID" --guild-id "$GUILD_ID" --apply --expected-digest "$DIGEST" --json
```

`notificationJobCount` と `postCount` が削除対象であること、`sentUrlEvidencePreservedFromUrlSentJobs` が保持されることを報告してから apply する。

manual check:

```bash
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- check --feed-id "$FEED_ID" --guild-id "$GUILD_ID" --json
op run --environment "$OP_ENVIRONMENT_ID" -- npm run manage-feeds -- check --feed-id "$FEED_ID" --guild-id "$GUILD_ID" --apply --expected-digest "$DIGEST" --json
```

check は fetch test ではない。pending job の処理、新着 enqueue、AnyToSummary、Discord 送信まで起こり得る。読み取り目的では apply しない。全 feed check は行わない。

## Recover from ambiguous writes

apply 中の network error や応答欠落では同じ write を再実行しない。add は `resolve` と `diagnose`、update は `status`、remove は `status` と `resolve`、check は `status` と `diagnose` で結果を照合する。

- 適用済みなら停止して結果を報告する。
- 未適用だと確認できた場合だけ fresh plan を作る。再 apply には元の明示依頼が引き続き有効で、fresh plan の内容が同じであることを確認する。
- 不明または部分適用なら mutation を止め、確認できた evidence と不明点を報告する。

stale digest を回避するために DB を直接変更しない。

## Report

次を短く報告する。

- 対象 URL と解決された feed URL
- guild、channel、feed ID
- 登録状態または delivery `state`
- 最初に止まっていた段階と実行した操作
- add の場合は既刊記事が backfill されないこと
- mutation の apply 結果。plan だけなら未変更であること
