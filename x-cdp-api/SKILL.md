---
name: x-cdp-api
description: chrome-devtools MCP でログイン済み Chrome を使い、X (Twitter) の内部 Web API (api.x.com / i/api) を fetch で呼んで一括操作する。ブロック解除、ブロック、ミュート、フォロー解除などをまとめて処理したいときに使う。X のレートリミット (短い窓あたり約 10 件) の回避方法を含む。「X で全員ブロック解除して」「まとめてミュート」「一括でフォロー解除」などのリクエストで使用する。
---

# X 内部 Web API 一括操作スキル (CDP 経由)

chrome-devtools MCP の `evaluate_script` で、ログイン済み Chrome のページコンテキストから X の内部 Web API を `fetch` で呼ぶ。UI をクリックして回るには件数が多すぎる一括操作 (ブロック解除、ブロック、ミュート、フォロー解除など) に使う。

## 前提条件

- chrome-devtools MCP が設定済み (未設定なら chrome-devtools-mcp スキルでセットアップ)
- Chrome で X にログイン済みで、x.com のタブが開いていること
- `evaluate_script` は x.com のページを選択した状態で実行する (cookie とオリジンを使うため)

## 使いどころの原則

- 投稿、リプライ、プロフィール、検索結果の閲覧・確認は、この API ではなく chrome-devtools MCP の UI 操作で行う (グローバル方針)。この API は、UI では現実的でない件数の書き込み系アクションを一括実行するためのもの。
- 破壊的・不可逆に近い操作 (ブロック解除、フォロー解除など) は、実行前にユーザーの明示承認を得る。
- 対象 ID のリストは事前に用意しておく。ハンドルから user_id を引く必要がある場合は egoquery + fxtwitter などで解決してから使う。

## 認証

内部 API は 2 つの値で認証する。どちらもログイン済みページから取得できる。

- Bearer トークン: X Web クライアント共通の公開トークン (secret ではない)。`AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA`
- CSRF トークン: cookie の `ct0` の値をそのまま `x-csrf-token` ヘッダに入れる

`fetch` は必ず `credentials: 'include'` を付ける (ログイン cookie を送るため)。

## 基本形

1 件呼ぶ最小形。エンドポイントとボディを差し替えて使う。

```js
async () => {
  const ct0 = document.cookie
    .split("; ")
    .find((c) => c.startsWith("ct0="))
    ?.slice(4);
  if (!ct0) return { error: "no ct0 cookie (ログインを確認)" };
  const res = await fetch("https://x.com/i/api/1.1/blocks/destroy.json", {
    method: "POST",
    credentials: "include",
    headers: {
      authorization:
        "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
      "x-csrf-token": ct0,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "user_id=340173578",
  });
  return { status: res.status, body: (await res.text()).slice(0, 200) };
};
```

## 主なエンドポイント (REST v1.1)

いずれも POST、ボディは `user_id=<ID>` の form-urlencoded。成功で 200 と対象ユーザーオブジェクトを返す。冪等 (既にその状態でも 200)。

- ブロック解除: `https://x.com/i/api/1.1/blocks/destroy.json`
- ブロック: `https://x.com/i/api/1.1/blocks/create.json`
- ミュート解除: `https://x.com/i/api/1.1/mutes/users/destroy.json`
- ミュート: `https://x.com/i/api/1.1/mutes/users/create.json`
- フォロー解除: `https://x.com/i/api/1.1/friendships/destroy.json`

一覧取得 (GET、カーソルページング):

- ブロック中の ID 一覧: `https://x.com/i/api/1.1/blocks/ids.json?stringify_ids=true&cursor=<cursor>`
  - 初回 `cursor=-1`。レスポンスの `next_cursor_str` が `'0'` になるまで繰り返す。1 ページ最大 5000 件。`stringify_ids=true` を付けないと大きい ID が丸められるので必須。

## レートリミット (最重要)

`blocks/destroy` など書き込み系は、短い時間窓あたり 約 10〜11 件までしか受け付けない。上限を超えると 12 件目以降が HTTP 404 で返る。

この 404 の性質:

- 時間間隔ではなく回数で決まる。リクエスト間を 1.2 秒空けても、同じ窓内で 11 件目以降は 404 になる。
- 位置依存。同じ ID でも、ループ先頭なら 200、11 件目以降なら 404 になる。つまり 404 は「相手が存在しない」ではなく、レートによる一時拒否。
- `x-rate-limit-remaining` ヘッダの残量とは別枠。remaining が潤沢でも、バーストすると 404 になる。
- 窓が空けばリセットされる。呼び出しを分けて数十秒空けると、また約 10 件通る。

## 一括処理の作法

上限を踏まえた安全なパターン。

1. 対象 ID を 10 件ずつのチャンクに分ける。
2. 1 チャンク = 1 回の `evaluate_script` 呼び出し。ループ内は各リクエスト間を 0.8 秒程度空ける。
3. チャンクとチャンクの間は 50〜65 秒空ける (窓のリセット待ち)。待機は Bash の `sleep` を `run_in_background: true` で回し、完了通知で次に進む。フォアグラウンド `sleep` は使わない。
4. 404 になった ID は次の窓でリトライする。冪等なので、成功済みを混ぜて再送しても害はない。
5. 全件が 200 になるまで繰り返す。
6. 検証: `blocks/ids.json` を `next_cursor_str` が `'0'` になるまで全ページ取得し、対象 ID との積集合が空であることを確認する (ブロック解除の場合)。

窓の回復が弱く 1 チャンクで 5 件程度しか通らないこともある。その場合は待機を長め (65 秒) にし、404 分を次チャンク先頭に混ぜて詰めていく。

`evaluate_script` 1 回で全件をループしようとしない。長時間 sleep を挟むとスクリプトがタイムアウトするし、そもそも 1 実行内では窓がリセットされない。必ず呼び出しを分ける。

## 注意事項

- Bearer と ct0 はログイン済みセッションの権限で動く。実行対象のアカウントがユーザー本人のものであることを確認する。
- ID 無し (削除・凍結済み) のアカウントは操作対象にできない。事前に除外する。
- エンドポイントやトークンは X 側の仕様変更で変わりうる。404 が全件で出る、200 でも body が想定と違う等の場合は、UI を実際に操作して現行の挙動を確認する。
