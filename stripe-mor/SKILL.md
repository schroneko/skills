---
name: stripe-mor
description: Stripe Managed Payments (MoR) によるサブスクリプション課金をプロジェクトに導入する。Stripe の Product/Price 作成、Checkout Session、Webhook によるサブスクリプションライフサイクル管理までをカバーする。「サブスクリプション課金を追加」「Stripe MoR を導入」「定額課金を実装」「Managed Payments」などのリクエストで使用する。
---

# Stripe Managed Payments (MoR) サブスクリプション導入ガイド

Stripe Managed Payments を使ったサブスクリプション課金の導入手順。Stripe が Merchant of Record (売上主体) として税金・通貨換算・法的コンプライアンスを処理する。

## 前提条件

- Stripe アカウント (Managed Payments が有効)
- Cloudflare Workers + Hono (他のランタイムでも応用可能)
- D1 (SQLite) または任意の DB

## Step 1: Stripe Product と Price を作成

Stripe Dashboard または API で Product と Price を作成する。

```bash
# Product 作成
curl -s -X POST https://api.stripe.com/v1/products \
  -u "sk_test_xxx:" \
  -d "name=Plus Plan" \
  -d "metadata[plan_id]=plus" | jq '{id, name}'

# Price 作成 (月額)
curl -s -X POST https://api.stripe.com/v1/prices \
  -u "sk_test_xxx:" \
  -d "product=prod_xxx" \
  -d "currency=jpy" \
  -d "unit_amount=980" \
  -d "recurring[interval]=month" | jq '{id, unit_amount, recurring}'

# Price 作成 (年額)
curl -s -X POST https://api.stripe.com/v1/prices \
  -u "sk_test_xxx:" \
  -d "product=prod_xxx" \
  -d "currency=jpy" \
  -d "unit_amount=9800" \
  -d "recurring[interval]=year" | jq '{id, unit_amount, recurring}'
```

Price ID (`price_xxx`) を控えておく。月額・年額それぞれ必要。

## Step 2: 環境変数を設定

```bash
echo "sk_test_xxx" | npx wrangler secret put STRIPE_SECRET_KEY
echo "whsec_xxx" | npx wrangler secret put STRIPE_WEBHOOK_SECRET
echo "price_xxx" | npx wrangler secret put STRIPE_PRICE_PLUS_MONTHLY
echo "price_xxx" | npx wrangler secret put STRIPE_PRICE_PLUS_YEARLY
echo "price_xxx" | npx wrangler secret put STRIPE_PRICE_PRO_MONTHLY
echo "price_xxx" | npx wrangler secret put STRIPE_PRICE_PRO_YEARLY
```

型定義に追加:

```typescript
interface Bindings {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_PLUS_MONTHLY: string;
  STRIPE_PRICE_PLUS_YEARLY: string;
  STRIPE_PRICE_PRO_MONTHLY: string;
  STRIPE_PRICE_PRO_YEARLY: string;
}
```

## Step 3: パッケージインストールと互換性設定

```bash
npm install stripe
```

`wrangler.toml` に `nodejs_compat` を追加 (Stripe SDK が Node.js `util` を使用):

```toml
compatibility_flags = ["nodejs_compat"]
```

## Step 4: DB マイグレーション

サブスクリプション管理に必要なカラムを追加:

```sql
ALTER TABLE user_settings ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE user_settings ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE user_settings ADD COLUMN subscription_status TEXT DEFAULT 'none';
ALTER TABLE user_settings ADD COLUMN current_period_end TEXT;
```

## Step 5: Stripe サービス層を実装

核となる関数群:

```typescript
import Stripe from "stripe";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

async function getOrCreateCustomer(
  stripe: Stripe,
  db: D1Database,
  userId: string,
  email: string,
): Promise<string> {
  // DB から stripe_customer_id を取得
  // なければ stripe.customers.create() して DB に保存
  // metadata に userId を含める
}

async function createCheckoutSession(
  stripe: Stripe,
  customerId: string,
  priceId: string,
  userId: string,
  origin: string,
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/#pricing`,
    metadata: { userId },
    managed_payments: { enabled: true },
  });
  return session.url!;
}
```

`managed_payments: { enabled: true }` が MoR の核心。これにより Stripe が税金・コンプライアンスを処理する。

## Step 6: Billing ルートを実装

3 つのエンドポイント:

```
POST /api/billing/checkout  - Checkout Session を作成して URL を返す (要認証)
POST /api/billing/webhook   - Stripe Webhook を受信 (認証不要、署名検証)
GET  /api/billing/status    - サブスクリプション状態を返す (要認証)
```

Webhook ハンドラーで処理するイベント:

| イベント                        | 処理内容                             |
| ------------------------------- | ------------------------------------ |
| `checkout.session.completed`    | サブスクリプション有効化、プラン更新 |
| `customer.subscription.updated` | ステータス・期間更新、プラン変更反映 |
| `customer.subscription.deleted` | Free プランにダウングレード          |
| `invoice.payment_failed`        | ログ記録 (将来的にメール通知)        |

Webhook 署名検証は `constructEventAsync` + `SubtleCryptoProvider` を使う:

```typescript
const event = await stripe.webhooks.constructEventAsync(
  body,
  signature,
  webhookSecret,
  undefined,
  cryptoProvider,
);
```

`c.req.text()` で body を取得すること。`c.req.json()` は署名検証に失敗する。

## Step 7: Price ID からプラン ID への逆引き

Webhook で受け取る情報は Price ID のみ。環境変数と照合してプラン ID に変換する:

```typescript
function resolvePlanIdFromPriceId(env: Bindings, priceId: string): string | null {
  const mapping: Record<string, string> = {
    [env.STRIPE_PRICE_PLUS_MONTHLY]: "plus",
    [env.STRIPE_PRICE_PLUS_YEARLY]: "plus",
    [env.STRIPE_PRICE_PRO_MONTHLY]: "pro",
    [env.STRIPE_PRICE_PRO_YEARLY]: "pro",
  };
  return mapping[priceId] ?? null;
}
```

## Step 8: Webhook を Stripe Dashboard で設定

1. https://dashboard.stripe.com/webhooks を開く
2. 「エンドポイントを追加」をクリック
3. URL: `https://yourdomain.com/api/billing/webhook`
4. イベントを選択:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Webhook シークレット (`whsec_*`) をコピーして環境変数に設定

## Step 9: フロントエンド - 料金ページと購読ボタン

月額/年額の切替 UI と Subscribe ボタンを実装:

```typescript
async function createCheckoutSession(planId: string, interval: string): Promise<{ url: string }> {
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ plan_id: planId, interval }),
  });
  return res.json();
}
```

Subscribe ボタンクリック時に `window.location.href = data.url` で Stripe Checkout にリダイレクト。

## Step 10: サブスクリプション管理リンク

Stripe Customer Portal または Stripe Link を使って顧客がサブスクリプションを自己管理できるようにする。

## 本番移行チェックリスト

1. Stripe Dashboard でテストモードから本番モードに切替
2. 本番の Product/Price を作成 (テストとは別)
3. 本番の API キー (`sk_live_*`) を設定
4. 本番の Webhook エンドポイントを作成し、シークレットを設定
5. 全ての Price ID 環境変数を本番用に更新

## よくある問題

### "No such module util" エラー

`wrangler.toml` に `compatibility_flags = ["nodejs_compat"]` を追加する。

### Webhook 署名検証エラー

- `STRIPE_WEBHOOK_SECRET` がテスト/本番で混在していないか確認
- body を `c.req.text()` で取得しているか確認 (`c.req.json()` は NG)

### checkout.session.completed で plan_id が取れない

Session 作成時に `metadata.userId` をセットし、`expand: ["line_items"]` でイベント受信時に Price 情報を取得する:

```typescript
const session = await stripe.checkout.sessions.retrieve(sessionId, {
  expand: ["line_items"],
});
const priceId = session.line_items?.data[0]?.price?.id;
```
