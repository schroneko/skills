---
name: stripe
description: Stripe 決済の導入・テスト・運用ガイド。新規プロジェクトへの Stripe 導入、本番/テストモード切替、決済テスト、返金処理などを行う。「Stripe を導入したい」「決済機能を追加」「返金したい」「Stripe のテスト」などのリクエストで使用する。
---

# Stripe 決済ガイド

Stripe 決済の導入から運用までをカバーする。

## API キー管理

### キーの種類

| キー            | 形式                      | 用途                     |
| --------------- | ------------------------- | ------------------------ |
| Publishable Key | `pk_test_*` / `pk_live_*` | クライアント側（公開可） |
| Secret Key      | `sk_test_*` / `sk_live_*` | サーバー側（秘匿必須）   |
| Webhook Secret  | `whsec_*`                 | Webhook 署名検証用       |

### 1Password Environment への保存

ローカル開発用の値は既存の 1Password Environment に保存する。vault item は作らない。

- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

追加・更新には `$onepassword-environment-secrets` を使い、実行時は `op run --environment "$OP_ENVIRONMENT_ID" -- <command>` で注入する。

### Cloudflare Workers への設定

公開キーは `wrangler.toml` の `[vars]` に、秘匿キーは Worker secret に設定する。Cloudflare 操作には 1Password を使わず、Wrangler の OAuth セッションを使う。

```toml
[vars]
STRIPE_PUBLISHABLE_KEY = "pk_live_xxx"
```

```bash
wrangler whoami
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
```

## Webhook 設定

### Stripe Dashboard での設定

1. https://dashboard.stripe.com/webhooks
2. 「エンドポイントを追加」
3. URL: `https://example.com/api/webhook`
4. イベント: `checkout.session.completed` を選択
5. Webhook シークレット（`whsec_*`）をコピーして保存

### Webhook ハンドラー実装（Hono + Cloudflare Workers）

```typescript
import Stripe from "stripe";

webhookRoutes.post("/", async (c) => {
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing signature" }, 400);
  }

  const body = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // 注文処理
  }

  return c.json({ received: true });
});
```

## Checkout Session 作成

```typescript
const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
});

const session = await stripe.checkout.sessions.create({
  mode: "payment",
  line_items: [
    {
      price_data: {
        currency: "jpy",
        product_data: { name: "商品名" },
        unit_amount: 1000,
      },
      quantity: 1,
    },
  ],
  success_url: `${c.env.SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${c.env.SITE_URL}/cancel`,
  metadata: {
    userId: "xxx",
    // カスタムデータ
  },
});

return c.json({ url: session.url });
```

## 決済テスト

### 最低決済額

| 通貨 | 最低額 |
| ---- | ------ |
| JPY  | 50円   |
| USD  | $0.50  |

テスト用商品は最低額で作成する。

### テストカード（テストモード用）

| カード番号          | 結果            |
| ------------------- | --------------- |
| 4242 4242 4242 4242 | 成功            |
| 4000 0000 0000 0002 | 拒否            |
| 4000 0000 0000 3220 | 3D セキュア必須 |

有効期限: 将来の任意の日付、CVC: 任意の 3 桁

## 返金処理

### CLI から返金

```bash
# 1. Stripe セッション ID から payment_intent を取得
curl -s -u "sk_live_xxx:" "https://api.stripe.com/v1/checkout/sessions/cs_live_xxx" | jq -r '.payment_intent'

# 2. 返金実行
curl -s -X POST "https://api.stripe.com/v1/refunds" \
  -H "Authorization: Bearer sk_live_xxx" \
  -d "payment_intent=pi_xxx" | jq '{id, status, amount}'
```

### 部分返金

```bash
curl -s -X POST "https://api.stripe.com/v1/refunds" \
  -H "Authorization: Bearer sk_live_xxx" \
  -d "payment_intent=pi_xxx" \
  -d "amount=500" | jq '{id, status, amount}'
```

## テスト/本番モードの切替

### 確認方法

- キーが `pk_test_*` / `sk_test_*` → テストモード
- キーが `pk_live_*` / `sk_live_*` → 本番モード

### 切替手順

1. Stripe Dashboard で本番キーを取得
2. 1Password Environment のローカル開発用変数を更新
3. `wrangler.toml` の `STRIPE_PUBLISHABLE_KEY` を更新
4. `wrangler secret put` で Worker secret を更新
5. Webhook を本番モードで作成し、シークレットを更新
6. デプロイ

```bash
wrangler whoami
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
npm run build
wrangler deploy
```

## Cloudflare Workers での注意点

### nodejs_compat フラグ

Stripe SDK は Node.js の `util` モジュールを使用するため、`wrangler.toml` に以下が必要:

```toml
compatibility_flags = ["nodejs_compat"]
```

### SubtleCrypto Provider

Webhook 署名検証には `Stripe.createSubtleCryptoProvider()` を使用する（Workers 環境では Node.js の crypto が使えないため）。

## トラブルシューティング

### "No such module util" エラー

`compatibility_flags = ["nodejs_compat"]` を追加してビルドし直す。

### Webhook 署名エラー

1. `STRIPE_WEBHOOK_SECRET` が正しいか確認
2. テスト/本番モードの Webhook シークレットが混在していないか確認
3. `c.req.text()` で body を取得しているか確認（`c.req.json()` は NG）

### 決済後にデータベースに保存されない

Webhook エンドポイントが正しく設定されているか確認:

```bash
wrangler tail --format=pretty
```
