---
name: discord-x-role-audit
description: Audit Discord server members who have an X role by using the logged-in Chrome/Discord/X web UIs. Use when asked to list Discord members whose linked X account does not follow the server owner, whose X profile is unavailable, or whose Discord profile lacks an X connection, especially before preparing a kick approval list. Do not use the X API, xurl, search APIs, or connectors for reading X.
---

# Discord X Role Audit

## Core Rules

- Use the Chrome plugin or Computer Use against the logged-in browser session.
- Do not use X API, xurl, X connectors, search APIs, or unauthenticated web search to inspect X profiles.
- Do not kick, ban, remove roles, follow, unfollow, like, repost, message, or otherwise mutate accounts during audit.
- Produce review files first. Kick actions require explicit user approval after the candidate list is shown.
- Treat Discord member count text as a weak signal. Verify the role filter by checking the role checkbox state, not by assuming `members of N` is stable.
- Before clicking a Discord role filter item, read its checked state. Never blindly click `X`, because that can turn an active filter off.

## Workflow

1. Open Discord Member Safety for the target guild in Chrome.
2. Open the `Roles` column filter and ensure the role named `X` is checked.
3. Collect the X-role member list from the table into `x-role-members-verified.json` and `.csv`.
4. Exclude the owner/current user when requested.
5. For each member, search by Discord username in Member Safety, open the member profile, and inspect `Connections`.
6. Extract the X connection URL from the Discord profile. If no X connection is visible, mark `no_x_connection_found`.
7. Open the linked X profile in Chrome and inspect the page text or DOM snapshot.
8. Mark `follows_you` only when `フォローされています` or `Follows you` is visible.
9. Mark `profile_unavailable` when X shows unavailable/error text for the linked profile.
10. Mark `not_following` only when the X profile loads but no follows-you label is visible.
11. Save progress after each batch and generate candidate CSV/JSON files.
12. Retry transient Discord search errors once before finalizing.

## Status Values

- `follows_you`: X profile visibly shows `フォローされています` or `Follows you`.
- `not_following`: X profile loads and no follows-you label is visible.
- `profile_unavailable`: Linked X profile shows unavailable, missing account, or generic X error text.
- `no_x_connection_found`: Discord profile opened, but no X connection link was found.
- `error`: Browser or Discord search failed. Remove these rows from progress and retry before final output.

## Reusable Script

Use `scripts/discord-x-role-audit.mjs` from Node REPL after bootstrapping the Chrome plugin.

Example:

```js
const { setupAtlasRuntime } = await import('<chrome-plugin-root>/scripts/browser-client.mjs');
await setupAtlasRuntime({ globals: globalThis });
globalThis.browser = await agent.browsers.get('extension');
await browser.nameSession('Discord X audit');

const { runAuditBatch, writeCandidates } = await import('file:///absolute/path/to/discord-x-role-audit/scripts/discord-x-role-audit.mjs');

await runAuditBatch(browser, {
  guildId: '1394286479642988574',
  workspaceDir: '/absolute/path/to/workspace',
  limit: 5,
  excludeDiscordUsernames: ['_schroneko']
});

await writeCandidates({
  workspaceDir: '/absolute/path/to/workspace'
});
```

Keep batches small enough to return before the tool timeout. Five members per batch is usually stable.

## Output Files

Use these default filenames in the workspace:

- `x-role-members-verified.json`
- `x-role-members-verified.csv`
- `x-role-follow-audit-progress.json`
- `x-role-follow-audit-progress.csv`
- `x-role-candidates-final.json`
- `x-role-candidates-final.csv`

Candidate files should include Discord display name, Discord username, X handle or URL, connection status, follow status, evidence, page title, and error.

## Final Review

Before recommending kick candidates:

1. Confirm progress covers every target member excluding the owner/current user.
2. Regenerate candidate files from progress.
3. Separate hard evidence from review-needed cases:
   - hard candidate: `not_following`
   - review candidate: `profile_unavailable` or `no_x_connection_found`
4. Tell the user that no kick has been performed.
5. Ask for approval only when the next action would actually kick members.
