---
name: discord-x-follower-audit
description: Audit members of a specified Discord role against whether their Discord-connected X account follows the currently logged-in X account. Use when Codex needs to inspect Discord Web in the user's existing Chrome profile, enumerate every member of an X-linked or access-control role including offline members, extract each member's connected X handle, identify confirmed non-followers through X profile UI, separate missing or unavailable connections from non-followers, resume safely after Discord or X rate limits, and produce a read-only review list without changing roles, kicking members, messaging users, or performing X writes.
---

# Discord X Follower Audit

## Workflow

Use Chrome DevTools MCP with the user's existing logged-in Chrome profile. Keep the workflow read-only.

1. Confirm the visible Discord account, server, target role, logged-in X account, and organizer X handle.
2. Open the Discord server's `Members` management page.
3. Filter `ROLES` by the exact target role and set the page size to 100.
4. Record the filtered total. Do not use the channel sidebar heading such as `X, 131 members` as the role total because it reflects currently online members.
5. Enumerate every filtered member across all pages and key records by normalized Discord username.
6. Open each member's full profile in bounded batches and collect every exact `https://x.com/<handle>` connection link from the `Connections` section.
7. Treat `Unable to load parts of profile`, an HTTP 429, or a missing profile dialog as unknown. Never reinterpret a failed load as a missing X connection.
8. Check every extracted handle through X profile UI while logged in as the organizer. When the user explicitly authorizes X internal Web API use, use the validated fast path in the browser workflow and keep UI rechecks for proposed non-followers.
9. Report confirmed non-followers separately from missing connections, unavailable profiles, nonexistent X accounts, protected accounts, and unchecked rows.
10. Verify that confirmed followers, confirmed non-followers, and all unknown categories reconcile to the filtered Discord role total.

Read [references/browser-workflow.md](references/browser-workflow.md) before running the browser audit. It contains the tested extraction, batching, rate-limit, and verification patterns.

## Required Browser State

- Use the user's normal Chrome profile, not an automation-only or logged-out profile.
- Confirm Discord identity from the visible user-status area.
- Confirm X identity from the sidebar profile link. Treat `/nukonuko` and another handle as different accounts even when both belong to the user.
- Stop before reading private or authenticated state when the expected logged-in profile cannot be confirmed.

## Safety Rules

- Never add or remove roles, kick, ban, prune, message, mute, timeout, approve, or otherwise modify Discord members.
- Never follow, unfollow, block, mute, report, post, reply, like, or modify X state.
- Never click controls whose accessible name includes `Remove role`, `Add Roles`, `More Options`, `Prune`, or another member-changing action.
- Never expose Discord authorization headers, cookies, X cookies, CSRF tokens, bearer tokens, installation identifiers, or raw authenticated request headers in tool output, files, or chat.
- Use visible Discord and X UI as the default source of truth. Use X internal Web API only after the user explicitly authorizes it, and only through the logged-in X page context described in the browser workflow.
- Never print, return, save, or log the X CSRF token, Discord authorization token, cookies, or raw authenticated request headers when using an authorized internal API fast path.
- Stop profile expansion as soon as Discord shows `Unable to load parts of profile` or a network request returns 429. Record the server-provided retry time when it is visible, close the dialog, and resume only after the restriction expires.
- Keep unknowns separate from confirmed non-followers.

## Identity and Result Rules

- Normalize Discord usernames and X handles case-insensitively for comparisons while preserving original casing for display.
- Use Discord display names only as labels. Do not use them as identity keys.
- Accept an X connection only from the full profile's `Connections` section and an exact profile URL matching `https://x.com/<handle>`. Treat an X or Twitter URL in the bio as an unverified profile link, not a Discord connection.
- Do not infer an X handle from a Discord username, display name, bio text, old Twitter URL, server tag, or message history.
- Before classifying `missing_connection`, wait at least 1.5 seconds after the expected Discord username appears, then close and reopen the profile once and wait again. Discord can render the `Connections` section after the rest of the profile.
- Preserve all X connections when one Discord member exposes multiple X accounts. Check each handle and report mixed results explicitly.
- Treat a profile whose details did not load as `discord_profile_unavailable`.
- Treat an X account that does not exist or is suspended as `x_account_unavailable`.
- Treat a protected X account as `protected` unless the visible relationship badge can still be read confidently.
- Treat absence of `フォローされています` or `Follows you` on a successfully loaded public X profile as `not_following`.
- For the authorized X internal API fast path, classify `relationship_perspectives.followed_by === true` as `following` and `false` as a proposed `not_following`. Re-check every proposed non-follower in the visible X UI before reporting.

## Checkpointing and Resume

Maintain a JSON checkpoint in the current task's working directory. Include:

- server id and server name
- role id when visible and exact role name
- organizer X handle
- filtered role total
- normalized Discord username
- Discord display name
- connected X handle and URL
- Discord profile status
- X relationship status
- checked timestamp
- next Discord page and row

Reuse successful Discord-to-X mappings within the same audit. Re-check role membership and X relationship on every new audit because both can change. Never store credentials or raw authenticated responses.

## Rate-Limit Discipline

- Start with a five-member probe.
- Process Discord profiles in batches of at most 20, then check page health and recent network status before continuing.
- Wait for each full profile to finish loading before reading connections.
- Do not count a batch result when the browser call times out before returning it.
- Stop immediately on Discord 429, Cloudflare 1015, `Unable to load parts of profile`, X rate-limit UI, or a profile page that stops loading relationship badges.
- Respect the returned retry interval. Do not attempt alternate endpoints or rapid retries.
- Resume from the checkpoint and re-run the interrupted row because its prior result is unknown.
- For the authorized X internal API fast path, read only `x-rate-limit-remaining` and `x-rate-limit-reset` from a 429 response. Do not inspect or emit request headers. Wait until the returned reset epoch, then retry only unchecked handles.

## Verification

Before reporting:

1. Re-open the Discord `Members` page and reapply the exact role filter.
2. Confirm the filtered total still matches the audit source total. If it changed, identify added and removed role members before reconciling.
3. Confirm every role member appears in exactly one terminal category.
4. Re-check each proposed non-follower's X profile individually in the current logged-in X session.
5. Confirm no profile-load failure is present in the non-follower list.
6. Report counts for role members, connected handles, confirmed followers, confirmed non-followers, and each unknown category.

## Reporting

Lead with the confirmed non-followers in a compact table:

| Discord | Display name | X | Evidence |
| --- | --- | --- | --- |

Then report unknowns in separate tables by reason. Finish with a reconciliation line and state explicitly that no Discord or X write action was taken.

Render every X account as a clickable Markdown link to its exact `https://x.com/<handle>` URL. Do not present a bare `@handle` without a link, including unavailable accounts and exception tables.
