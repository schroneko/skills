---
name: slack-workspace-cleanup
description: Inspect Slack workspaces from the user's logged-in Chrome session, list and classify them, and open workspace-specific account deactivation pages without deactivating any account. Use when the user asks to review Slack workspaces, find unnecessary workspaces, prepare deactivation tabs, or repeat a safe Slack cleanup workflow.
---

# Slack Workspace Cleanup

Use Chrome DevTools Protocol through the existing logged-in Chrome session. Treat Slack workspaces as the target; do not call them channels in status reports.

## Safety boundary

- Never click `Deactivate`, `Deactivate Account`, `Yes, deactivate my account`, or any equivalent confirmation unless the user separately and explicitly asks to perform the deactivation.
- Opening `/account/deactivate` is a preparation step, not a deactivation.
- Do not sign out, remove members, delete profile data, change settings, or authenticate to an additional workspace unless the user asks for that specific action.
- Do not invent workspace URLs. Obtain workspace links or slugs from the current Slack DOM, then resolve the workspace-specific account page.
- Report any workspace that cannot be opened instead of silently omitting it.

## Workflow

### 1. Inspect the existing browser session

1. Call `mcp__chrome_devtools__list_pages`.
2. Use an existing Slack page in the user's normal Chrome profile. Do not create a new profile or ask the user to sign in to an unrelated browser session.
3. Call `mcp__chrome_devtools__take_snapshot` on the relevant Slack page.
4. If the Slack workspace chooser is not open, navigate only to a Slack sign-in or workspace-list page already reachable from the current session.

### 2. Build a complete workspace inventory

1. Read every visible workspace entry from the latest snapshot, including its exact displayed name, member count when shown, authentication state, and link.
2. Expand controls such as `さらに表示する`, `Show more workspaces`, or equivalent, then take a new snapshot and include the newly revealed entries.
3. Deduplicate by workspace URL, workspace ID, or canonical workspace link. Do not deduplicate by a shortened display name alone.
4. Re-read the full list after any account deactivation has already occurred. Slack can temporarily show stale entries, and the post-refresh list is the source of truth for the next inventory.
5. Show the inventory to the user before classifying or opening deactivation pages when the user has not already supplied the classification.

Record entries marked as requiring additional authentication, but do not authenticate automatically. If the user says those entries are required, preserve them as required workspaces.

### 3. Apply the user's classification

1. Preserve explicit `必要` and `不要` classifications exactly.
2. If the user explicitly says that all unclassified entries are unnecessary, classify every remaining inventory entry as `不要`.
3. If any entries remain unclassified and the user has not given that instruction, list them separately and do not open or deactivate them by inference.
4. Reconcile the classification against the complete inventory count. Check names one by one so no workspace is silently omitted.

### 4. Open deactivation pages only

For each workspace classified as `不要`:

1. Use the current DOM link to open the workspace in a background tab when possible.
2. Resolve the canonical workspace host from the resulting page. If the workspace link contains a temporary login token, use it only to reach the workspace; do not expose or reuse it as a permanent URL.
3. Navigate that tab to the exact workspace-specific `/account/deactivate` path.
4. Verify with the page title, URL, or DOM text that the page is an account deactivation page for the intended workspace.
5. Leave the deactivation page open and do not click any control on it.

If the workspace requires an additional authentication step or the redirect fails, leave the tab at the observed state and report the blocker with the workspace name. Do not retry by inventing a different URL or silently skip it.

### 5. Report completion

Report:

- The complete inventory count.
- The workspaces classified as required and unnecessary.
- The exact unnecessary workspaces whose deactivation pages were opened.
- Any unresolved workspace and the observed reason.
- An explicit statement that no deactivation button was pressed.

Before saying there are no remaining workspaces, compare the final report against the latest full snapshot, including entries revealed by an expand control.
