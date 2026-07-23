---
name: analyze-x-subscriptions
description: Analyze X creator subscription accounts through X's authenticated internal Web API. Use when asked to collect subscriber counts, subscription-only post counts, monthly prices, estimated gross monthly revenue, rankings, or summary statistics for X Subscriptions, including the user's managed set of subscribed creators.
---

# Analyze X Subscriptions

Use the logged-in X session in Chrome to collect and analyze creator subscription data. Perform the browser and API work yourself. Never ask the user to paste JavaScript or manually inspect DevTools.

## Workflow

1. Confirm that Chrome is using the user's existing logged-in profile and that an `x.com` page is open.
2. Determine the target handles:
   - Use handles explicitly supplied in the request.
   - When the user refers to the managed set or the previously collected 25 creators, use `references/default-handles.json`.
   - Normalize handles by removing a leading `@` and deduplicate them.
3. Run `node scripts/build-analysis-eval.mjs` from this skill directory. Append handles as positional arguments to override the managed set.
4. Execute the emitted async function with Chrome DevTools MCP `evaluate_script` on an authenticated `x.com` page.
5. If either GraphQL operation returns HTTP 404, open one creator subscription page, inspect the live requests for the current query IDs, and rerun with:
   - `--screen-query-id <id>`
   - `--paywall-query-id <id>`
6. Present the result inline as plain text. Do not create a file unless the user explicitly requests one.

## Output Rules

- Sort by subscriber count from highest to lowest and put unavailable counts last.
- Use account display names, not handles, unless the user asks for handles.
- Do not prefix names with `@`.
- Do not add sequence numbers.
- State that an unavailable subscriber count is undisclosed, not zero.
- Report requested, successful, unavailable, and failed counts.
- Report total, average, median, maximum, and minimum subscriber counts using only disclosed counts.
- Report estimated gross monthly revenue grouped by currency. Never add unlike currencies.
- Describe revenue as a gross estimate before platform fees and taxes.
- Include errors only for accounts that failed.

## Data Fields

Each row contains:

- `accountName`
- `handle`
- `restId`
- `subscriberCount`
- `exclusivePostCount`
- `monthlyPrice`
- `currencyCode`
- `estimatedMonthlyRevenue`
- `error`

The result also includes `summary` and the GraphQL query IDs used.

## Safety and Reliability

- Use only the authenticated browser session the user placed in scope.
- Do not expose cookies, CSRF tokens, authorization headers, or raw request headers.
- Keep requests sequential with the built-in delay.
- Retry HTTP 429 and server errors only within the script's bounded retry policy.
- Stop and report persistent rate limiting instead of increasing request volume.
- Treat internal X API schemas and query IDs as unstable. Verify live request paths when the fallback IDs stop working.
