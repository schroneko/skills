---
name: manage-feedmanager
description: FeedManager の Discord `/add` 運用と配信状態を調査する。通常 feed の登録状態、Web ページ登録 fallback、AnyToSummary と Discord 配信の停止段階を確認する。「この URL は流れている？」「/add が失敗した」「Web ページ登録の確認が出ない」「記事が届かない原因を調べて」などで使用する。Codex から feed を登録する操作には使わない。
---

# Manage FeedManager

この skill は FeedManager の実装と配信状態を読み取りで調査するためのものだよ。feed の登録操作は Discord の `/add` だけで行い、Codex から API、CLI、raw D1 write、Discord `/add` の代替操作を実行しない。

## Discord での登録手順

1. Discord で `/add url:<URL>` を実行する。
2. RSS、Atom、ICS、サイト固有の変換、HTML alternate feed が見つかれば、表示された feed の確認 UI で「登録する」を押す。
3. 通常の feed として取得できず、入力 URL が HTML Web ページなら、FeedManager が「この Web ページを新規登録しますか？」を表示する。
4. Web ページ登録を選ぶと、ページ内容の初期 version は既読として保存される。登録直後の既刊内容は通知されず、以後のページ内容の変更だけが AnyToSummary と Discord へ流れる。
5. 確認 UI が出ない場合は、入力 URL が HTML として取得できない、unsafe URL、サイズ超過、または別の feed 候補が選ばれた可能性を診断する。Codex から登録を迂回しない。

## `/add` failure の確認

FeedManager リポジトリを読み取りで確認し、次の順に原因を切り分ける。

- 入力 URL の変換結果と HTML alternate discovery
- feed fetch の HTTP status、redirect、timeout、parse error
- 登録後の `feeds.ready`、`notification_enabled`、`error_count`
- poll の `last_checked_at`、`last_error`
- `notification_jobs` の phase と retry 状態
- AnyToSummary の `summary_logs` と `news_items`
- Discord webhook の存在、URL 送信、summary 送信、`delivered_at`

`notification_jobs` がないことだけでは完了と判定しない。正常完了でも job は削除されるため、同じ guild の `sent_urls`、`news_items.delivered_at`、`posts` と組み合わせる。

Web ページ source では、同じページの内容 hash が変わったときだけ version item が作られる。初期 version が `posts` にあることは、Discord へ配信済みという意味ではない。

## 実装を変更するとき

- `/add` の通常 feed 登録と確認 task の副作用境界を壊さない。
- Web ページ登録は `FeedService`、`FeedRepository`、`FeedUpdater`、Discord confirmation の共有経路へ実装する。
- `webpage_sources` と confirmation type `webpage` を使い、直接 D1 に feed を作らない。
- 外部 URL は既存の public HTTP validation、redirect、body size、timeout を通す。
- 503、408、429、network error、内部 timeout の登録 fetch は bounded retry し、parse error と unsafe URL は retry しない。
- 初期 version を通知対象にして過去記事を backfill しない。

## 禁止する操作

- `OPERATIONS_TOKEN` の作成、注入、取得、表示
- `npm run manage-feeds` などの Codex 用登録 CLI の追加
- `/operations/*`、raw D1 INSERT、remote D1 write による登録
- Discord UI の代わりに管理画面 DOM や外部 API から登録する fallback

## 検証

コード変更後は FeedManager リポジトリ内で `npm run check:migrations`、`npm run typecheck`、`npm run lint`、`npm test`、`npm run test:migrations` を実行する。登録の動作確認は Discord の `/add` と確認ボタンを使い、Codex 側から feed の状態を書き換えない。

## 報告

対象 URL、入力の種類、最初に止まった段階、確認できた evidence、Discord で行う次の操作だけを短く報告する。登録済み、配信済み、登録しただけを混同しない。
