import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultHandlesPath = path.join(scriptDirectory, "..", "references", "default-handles.json");
const fallbackQueryIds = {
  screen: "yxrsyXvMrEq7-0FNeN3XDA",
  paywall: "Q1GvU4OYJLFBG9gi51HgZg"
};

const args = process.argv.slice(2);
const handles = [];
let screenQueryId = fallbackQueryIds.screen;
let paywallQueryId = fallbackQueryIds.paywall;
let delayMs = 250;
let maxRetries = 2;

for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--screen-query-id") {
    screenQueryId = args[index + 1] ?? "";
    index += 1;
  } else if (value === "--paywall-query-id") {
    paywallQueryId = args[index + 1] ?? "";
    index += 1;
  } else if (value === "--delay-ms") {
    delayMs = Number(args[index + 1]);
    index += 1;
  } else if (value === "--max-retries") {
    maxRetries = Number(args[index + 1]);
    index += 1;
  } else {
    handles.push(value);
  }
}

const sourceHandles = handles.length > 0
  ? handles
  : JSON.parse(fs.readFileSync(defaultHandlesPath, "utf8"));
const normalizedHandles = [...new Set(
  sourceHandles
    .map((value) => String(value).trim().replace(/^@/, ""))
    .filter((value) => /^[A-Za-z0-9_]{1,15}$/.test(value))
)];

if (normalizedHandles.length === 0) {
  throw new Error("No valid X handles were provided");
}

if (!screenQueryId || !paywallQueryId) {
  throw new Error("GraphQL query IDs must not be empty");
}

if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 10000) {
  throw new Error("delay-ms must be between 0 and 10000");
}

if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
  throw new Error("max-retries must be an integer between 0 and 5");
}

const configuration = JSON.stringify({
  handles: normalizedHandles,
  screenQueryId,
  paywallQueryId,
  delayMs,
  maxRetries
});

const evaluation = `async () => {
  "use strict";

  const configuration = ${configuration};
  const bearerToken = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

  if (location.hostname !== "x.com") {
    throw new Error("x.com のログイン済みページが必要です");
  }

  const csrfToken = document.cookie
    .split("; ")
    .find((item) => item.startsWith("ct0="))
    ?.slice(4);

  if (!csrfToken) {
    throw new Error("X のログインセッションを確認できません");
  }

  const findQueryId = (operationName, fallbackId) => {
    const entries = performance.getEntriesByType("resource").slice().reverse();
    const pattern = new RegExp("/i/api/graphql/([^/]+)/" + operationName + "(?:\\\\?|$)");
    for (const entry of entries) {
      const match = String(entry.name).match(pattern);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    return fallbackId;
  };

  const queryIds = {
    SubscriptionPaywallScreenQuery: findQueryId(
      "SubscriptionPaywallScreenQuery",
      configuration.screenQueryId
    ),
    SubscriptionPaywallQuery: findQueryId(
      "SubscriptionPaywallQuery",
      configuration.paywallQueryId
    )
  };

  const headers = {
    authorization: "Bearer " + bearerToken,
    "x-csrf-token": csrfToken,
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-client-language": document.documentElement.lang?.split("-")[0] || "ja",
    "content-type": "application/json"
  };

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const toNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(String(value).replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const requestGraphql = async (operationName, variables) => {
    const queryId = queryIds[operationName];
    const url = new URL(
      "/i/api/graphql/" + encodeURIComponent(queryId) + "/" + operationName,
      location.origin
    );
    url.searchParams.set("variables", JSON.stringify(variables));

    for (let attempt = 0; attempt <= configuration.maxRetries; attempt += 1) {
      let response;
      try {
        response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers
        });
      } catch {
        if (attempt === configuration.maxRetries) {
          throw new Error(operationName + " の通信に失敗しました");
        }
        await sleep(Math.min(4000, 500 * 2 ** attempt));
        continue;
      }

      if (response.ok) {
        const body = await response.json();
        if (Array.isArray(body.errors) && body.errors.length > 0 && !body.data) {
          const message = body.errors
            .map((error) => error?.message)
            .filter(Boolean)
            .join("; ")
            .slice(0, 300);
          throw new Error(message || operationName + " がエラーを返しました");
        }
        return body;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < configuration.maxRetries) {
        await sleep(Math.min(4000, 500 * 2 ** attempt));
        continue;
      }

      if (response.status === 404) {
        throw new Error(operationName + " の query ID が無効です");
      }
      throw new Error(operationName + " が HTTP " + response.status + " を返しました");
    }

    throw new Error(operationName + " の取得に失敗しました");
  };

  const rows = [];
  let viewerName = null;
  let viewerHandle = null;

  for (const requestedHandle of configuration.handles) {
    const row = {
      accountName: requestedHandle,
      handle: requestedHandle,
      restId: null,
      subscriberCount: null,
      exclusivePostCount: null,
      monthlyPrice: null,
      currencyCode: null,
      estimatedMonthlyRevenue: null,
      error: null
    };

    try {
      const screenBody = await requestGraphql("SubscriptionPaywallScreenQuery", {
        screenName: requestedHandle
      });
      const user = screenBody?.data?.user_result_by_screen_name?.result;

      if (!user?.rest_id) {
        throw new Error("アカウント ID を取得できませんでした");
      }

      const product = user.super_follow_creator_product_metadata;
      row.accountName = user.core?.name ?? requestedHandle;
      row.handle = user.core?.screen_name ?? requestedHandle;
      row.restId = user.rest_id;
      const amountInMicros = toNumber(product?.amount);
      row.monthlyPrice = amountInMicros === null ? null : amountInMicros / 1000000;
      row.currencyCode = product?.currency_code
        ? String(product.currency_code).toUpperCase()
        : null;

      const paywallBody = await requestGraphql("SubscriptionPaywallQuery", {
        restId: row.restId
      });
      const metrics = paywallBody?.data?.subscriptions_by_author_id
        ?.user_preference_subscribers_and_post_count;
      const viewer = paywallBody?.data?.viewer_v2?.user_results?.result;

      row.subscriberCount = toNumber(metrics?.subscriber_count);
      row.exclusivePostCount = toNumber(metrics?.subscriber_only_post_count);
      row.estimatedMonthlyRevenue = row.subscriberCount === null || row.monthlyPrice === null
        ? null
        : row.subscriberCount * row.monthlyPrice;
      viewerName ??= viewer?.core?.name ?? null;
      viewerHandle ??= viewer?.core?.screen_name ?? null;
    } catch (error) {
      row.error = error instanceof Error ? error.message : String(error);
    }

    rows.push(row);
    await sleep(configuration.delayMs);
  }

  rows.sort((left, right) => {
    if (left.subscriberCount === null && right.subscriberCount === null) {
      return left.accountName.localeCompare(right.accountName, "ja");
    }
    if (left.subscriberCount === null) return 1;
    if (right.subscriberCount === null) return -1;
    return right.subscriberCount - left.subscriberCount;
  });

  const successfulRows = rows.filter((row) => row.error === null);
  const countedRows = successfulRows.filter((row) => row.subscriberCount !== null);
  const counts = countedRows
    .map((row) => row.subscriberCount)
    .sort((left, right) => left - right);
  const totalSubscribers = counts.reduce((total, count) => total + count, 0);
  const medianSubscribers = counts.length === 0
    ? null
    : counts.length % 2 === 1
      ? counts[(counts.length - 1) / 2]
      : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2;
  const revenueByCurrency = {};

  for (const row of countedRows) {
    if (row.currencyCode && row.estimatedMonthlyRevenue !== null) {
      revenueByCurrency[row.currencyCode] =
        (revenueByCurrency[row.currencyCode] ?? 0) + row.estimatedMonthlyRevenue;
    }
  }

  const maximumRow = countedRows.length === 0
    ? null
    : countedRows.reduce((maximum, row) =>
      row.subscriberCount > maximum.subscriberCount ? row : maximum
    );
  const minimumRow = countedRows.length === 0
    ? null
    : countedRows.reduce((minimum, row) =>
      row.subscriberCount < minimum.subscriberCount ? row : minimum
    );

  return {
    summary: {
      generatedAt: new Date().toISOString(),
      viewerName,
      viewerHandle,
      requestedCount: configuration.handles.length,
      succeededCount: successfulRows.length,
      missingCount: successfulRows.filter((row) => row.subscriberCount === null).length,
      errorCount: rows.filter((row) => row.error !== null).length,
      totalSubscribers,
      averageSubscribers: counts.length === 0 ? null : totalSubscribers / counts.length,
      medianSubscribers,
      max: maximumRow
        ? {
            accountName: maximumRow.accountName,
            subscriberCount: maximumRow.subscriberCount
          }
        : null,
      min: minimumRow
        ? {
            accountName: minimumRow.accountName,
            subscriberCount: minimumRow.subscriberCount
          }
        : null,
      estimatedMonthlyRevenue: revenueByCurrency
    },
    rows,
    queryIds
  };
}`;

process.stdout.write(evaluation);
