---
name: luma-participant-check
description: Check Luma event guests against X profile, follow, and recent-account-activity requirements. Use when Codex needs to review a Luma event guest table, extract pending guests and X profile links, identify missing/invalid/deleted/protected X accounts, use X relationship lookup to verify whether guests follow the logged-in organizer account, check whether candidates have posted from their own X account within the last month excluding repost-only activity using read-only internal APIs, manage X rate limits without causing 429s, and report decline or approval-support candidates without ever performing approve, decline, or other guest write actions.
---

# Luma Participant Check

## Workflow

Use this skill for Luma events whose approval rules require a valid X profile, following the organizer's X account, and recent activity from the candidate's own X account.

Never approve or decline guests. Never perform Luma or X write actions for this workflow. Produce review lists, verification summaries, and manual-operation batches only.

When supporting manual review in batches, refresh or re-extract the Luma guest table before each new batch. Exclude guests whose current status is already `Not Going`, `Declined`, `Approved`, or `Going`. Only present guests that are still `Pending Approval`.

Before naming the next manual target, re-read Luma and confirm the guest is still `Pending Approval`. For follow-related targets, also re-run X relationship lookup for that specific current target set. Do not name a guest from cached or previous-turn results alone.

Manual review order:

1. First identify guests with no X profile, a non-repairable X profile value, a deleted or nonexistent X account, or a protected account. Report these as the first decline batch.
2. After the user manually declines that batch, refresh Luma and verify those guests moved out of `Pending Approval`.
3. Only then run or report follow checks for the remaining valid public X accounts. Accounts that do not exist cannot follow the organizer, so do not mix missing-account declines with not-following declines.
4. After the user manually handles not-following guests, refresh Luma again.
5. For remaining `Pending Approval` guests with valid public X accounts and `followed_by`, check account activity in strict stages. First identify accounts whose total post count is zero and report only that decline batch.
6. After the user manually declines zero-post accounts, refresh Luma and verify those guests moved out of `Pending Approval`.
7. Only then identify accounts with posts but no non-repost post from the account within the last month. Report that as a separate decline batch.
8. After the user manually handles the no-recent-own-post batch, refresh Luma again.
9. Treat remaining guests as approve candidates only when the account has at least one non-repost post from the account within the last month.

## Required Browser State

Use the user's logged-in Chrome profile when Luma admin access or X login state is required. Confirm the visible profile/session is the user's normal logged-in session before interacting with private admin pages.

Prefer the Luma guest table URL:

```text
https://luma.com/event/manage/guest-table/<event-id>
```

If the user gives the normal guests URL, derive the guest table URL from the event id and open it directly.

## Safety Rules

- Never click or call approve, decline, invite, cancel, delete, update, refund, check-in, message, email, or other guest-modifying actions.
- Do not replay or synthesize Luma requests whose URL, method, body, GraphQL operation, or response semantics indicate a write or mutation.
- Treat the user's manual approve / decline work as external state. Verify it by reading the table after the user says they are done.
- Do not open each X profile in a loop.
- Do not use X search or external search to infer relationships.
- Use X relationship lookup in batches for follow verification.
- Stop immediately and report status if any X request returns HTTP 429.
- For X recent activity checks, do not crawl profile UI. Use read-only internal X APIs only, except for a few exploratory probe requests needed to identify the current internal endpoint shape.
- After internal API shape is confirmed, switch immediately to scripted internal API reads. Do not continue opening or scrolling X profiles one by one.
- Keep request batches small, normally 50 handles per request.
- Do not expose auth cookies, CSRF tokens, bearer tokens, or raw request headers in the final answer.
- Repair obvious X URL typos before marking a row invalid, such as `https:/x.com/<handle>`, `http:/x.com/<handle>`, bare `x.com/<handle>`, or a broken anchor whose visible text still contains `x.com/<handle>`.
- Treat missing, non-repairable malformed, deleted, suspended, and protected X accounts as decline candidates when the event rule requires a public valid X profile.
- Treat accounts without `followed_by` as decline candidates when the rule requires following the organizer account.
- Keep unknowns separate from confirmed decline candidates.

## Luma Extraction

Open the Luma guest table in Chrome. Prefer safe read acceleration from observed Luma network traffic before falling back to DOM scrolling.

Read-only acceleration:

- Inspect Chrome DevTools network requests on the guest table page.
- Prefer already-observed Luma requests that return guest rows, registration answers, status, and profile links.
- Reuse only requests that are clearly read-only. GET requests are usually acceptable. POST requests are acceptable only when the body is clearly a read/query request and does not include mutation-like operation names or action fields.
- Save the read result as JSON and derive pending candidates from the current `status`.
- When parsing Luma `registration_answers`, extract the X handle only from the exact X profile question. Prefer a stable question id from the event, or a label containing `あなたの X のプロフィールリンク`, `X のプロフィールリンク`, `X profile`, or `Twitter profile`.
- Do not infer X handles from arbitrary short answers in other registration questions, such as role, company, LinkedIn, terms, or experience fields.
- Use `scripts/extract-luma-api-candidates.mjs` on saved Luma API JSON when using read-only acceleration.
- If read-only status is ambiguous, do not replay the request. Use the DOM extraction helper instead.
- Never use this acceleration for approve / decline execution.

Run API extraction:

```bash
node /path/to/luma-participant-check/scripts/extract-luma-api-candidates.mjs /path/to/luma-api-response.json
```

If the event's X question id is known, pass it explicitly:

```bash
node /path/to/luma-participant-check/scripts/extract-luma-api-candidates.mjs /path/to/luma-api-response.json --x-question-id n7ka2jlv
```

Spot-check suspicious names and duplicate names against raw `registration_answers` before reporting. Duplicate display names can refer to different guests with different statuses and X handles.

## Identity and Duplicate Handling

Treat display names as labels only, not identities. Always key Luma guests by `api_id` plus normalized X handle when comparing extraction results, manual decline confirmations, activity checks, and approval-support candidates.

- Normalize X handles case-insensitively and strip leading `@`.
- Treat duplicate display names as separate guest records even when the visible name is identical.
- Report duplicate-prone rows as `name @handle status` so the user can distinguish them.
- Do not collapse pending candidates by display name.
- When a row moves between `Pending Approval`, `Approved`, `Declined`, or `Not Going`, verify the specific `api_id` and normalized X handle rather than a same-name row.

DOM fallback:

Scroll or use the extraction helper until the full table is loaded.

Use `scripts/build-luma-extract-eval.mjs` to generate a Chrome DevTools `evaluate_script` function:

```bash
node /path/to/luma-participant-check/scripts/build-luma-extract-eval.mjs
```

Run the generated function on the Luma guest table page. Save the result as JSON in the working directory.

The extraction helper reads both anchor `href` values and visible link text. This matters because Luma can normalize a typo like `https:/x.com/<handle>` into a broken href while the visible text still contains the intended handle.

From the result, review:

- `pending`: guests with `Pending Approval`
- `candidates`: pending guests with a syntactically valid X handle
- `invalidX`: pending guests with no usable X profile link
- `allRows`: raw extracted rows for spot checks

Spot-check several rows against the visible table before using the result. If counts do not match the Luma UI, continue scrolling and re-run extraction.

Before presenting a new decline or approve support batch, re-run the Luma extraction or directly re-check the specific candidate rows. Remove any candidates that have changed to `Not Going` after the previous manual batch.
If the user asks "next" or "what should I do now", perform this refresh before answering with names. If a previously proposed guest is now `Declined`, `Not Going`, `Approved`, or `Going`, report that status and do not include them in the next action list.

## X Relationship Lookup

Use the logged-in X page for the organizer account. A followers page is a good starting point:

```text
https://x.com/<organizer-handle>/followers
```

Use Chrome DevTools network logs from an existing X request to confirm that authenticated X web requests are working. Do not print sensitive headers to the user.

Prepare a candidates JSON file shaped like:

```json
[
  {"name": "Guest Name", "handle": "guest_handle"}
]
```

Use `scripts/build-x-guest-check-eval.mjs` to generate a Chrome DevTools `evaluate_script` function:

```bash
node /path/to/luma-participant-check/scripts/build-x-guest-check-eval.mjs /path/to/candidates.json
```

Run the generated function on an X page while logged in as the organizer. It performs:

- `friendships/lookup.json` to read `connections`

Do not run bulk `users/lookup.json` by default. A single inactive, deleted, or renamed handle can make a batch return a noisy 404 and hide valid users in the same batch. Use X profile UI checks or targeted single-account read checks only when protected or deleted-account validation is still needed.

Interpret results:

- `connections` contains `followed_by`: the guest follows the organizer
- `connections` does not contain `followed_by`: decline candidate for not following
- no lookup result: unknown, usually missing/deleted/suspended/renamed
- X profile UI says the account does not exist: decline candidate for invalid X profile
- X profile UI says posts are protected: decline candidate for protected account

## X Recent Activity Check

Run this only after the guest has a valid public X account and `followed_by` is confirmed.

Use the logged-in browser profile only as an authenticated context for read-only internal X API requests. Do not inspect candidate timelines by scrolling or opening each X profile. A few probe requests are acceptable to confirm the current internal API endpoint shape; once the shape is understood, use scripted internal API reads and stop UI-based inspection.

Activity requirement:

- The account must have at least one post from the account within the last month.
- Separate decline patterns by stage. Report accounts with `legacy.statuses_count === 0` first, wait for the user to handle that batch, refresh Luma, and only then report accounts that have posts but no qualifying post within the last month.
- Reposts do not count.
- A reply or quote can count only when it includes the candidate's own text and appears on the candidate's account timeline.
- If the visible recent timeline contains only reposts, treat it as no qualifying recent activity.
- If a pinned post is before the cutoff date, do not count it just because it appears at the top of the profile.
- If an article contains a repost marker such as `<name>さんがリポスト`, treat it as a repost even when the candidate handle appears somewhere inside the article text.
- If the visible timeline shows recent reposts but the newest non-repost by the candidate is before the cutoff, treat the account as not approve-ready.
- If the timeline cannot be read confidently because of protected, deleted, suspended, or unavailable account state, keep it out of approve candidates and report it separately.

Observed internal API path:

- Use `UserByScreenName` first to resolve `rest_id`, account protection, and `legacy.statuses_count`.
- Treat `legacy.statuses_count === 0` as no posts.
- Use GraphQL `UserTweets` for timeline reads. In this environment, `UserTweets` returned timeline data while `UserTweetsAndReplies`, `SearchTimeline`, `users/lookup.json`, and `users/show.json` returned 404. Do not use those failed endpoints unless a fresh probe proves they work.
- Request only enough timeline data to answer the activity question, such as `count: 100`.
- Treat reposts as non-qualifying when `legacy.retweeted_status_result` exists or the full text starts with `RT @`.
- Read the author handle from `core.user_results.result.core.screen_name`. Do not rely on `legacy.screen_name`; in observed `UserTweets` responses that field was missing and caused false inactive results.
- Compare tweet `legacy.created_at` against the absolute cutoff timestamp.
- If every checked row becomes inactive, treat that as a parser failure until raw samples prove otherwise. Inspect one raw `UserTweets` sample and fix the parser before reporting names.

Rate-limit handling:

- Track `x-rate-limit-remaining`, `x-rate-limit-limit`, and `x-rate-limit-reset` for every internal X request.
- If `x-rate-limit-remaining` is low, for example 5 or less, stop before hitting 429 and wait until `x-rate-limit-reset`.
- Do not describe this as a 429. Report it as a preemptive stop before rate-limit exhaustion.
- If an actual 429 occurs, stop immediately and report the checked count, saved result file, endpoint, remaining/reset metadata if available, and that no approve or decline action was taken.

Use absolute dates in the working notes and final summary when applying the one-month cutoff. For example, on 2026-07-05, the cutoff is 2026-06-05.

Do not over-fetch timelines. Check only enough internal timeline data to determine whether there is at least one qualifying non-repost post after the cutoff, or that the account has no qualifying visible post in that window. Validate this workflow on a small set of real candidate profiles before changing this section again.

## Reporting

Report concise sections:

- Confirmed decline candidates: no valid X profile
- Confirmed decline candidates: protected X account
- Confirmed decline candidates: not following the organizer
- Confirmed decline candidates: zero X posts
- Not approve-ready: X posts exist, but no qualifying non-repost X post within the last month
- Unknown: lookup did not return a usable account
- Manual batch verification: which proposed names are now `Not Going`, which remain `Pending Approval`, and which were not found in the current virtual table scan
- Verification: total candidates checked, X request count, whether 429 occurred

State explicitly that no Approve / Decline action was taken.

Avoid long explanations unless the user asks for them.
