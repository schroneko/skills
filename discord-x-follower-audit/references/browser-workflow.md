# Browser Workflow

## Contents

1. Confirm sessions
2. Enumerate the Discord role
3. Extract X connections
4. Detect failed profile loads
5. Check X follow relationships
6. Use the authorized X internal API fast path
7. Reconcile results

## Confirm sessions

Call `list_pages` and select the existing Discord tab. Confirm the server URL and visible Discord username. Select an existing X tab and confirm the logged-in account from the sidebar profile link.

Use only the normal logged-in Chrome profile. Do not open a new isolated browser context.

## Enumerate the Discord role

Open the server `Members` entry. The expected route is:

```text
https://discord.com/channels/<guild-id>/member-safety
```

Click `ROLES`, select the exact role, close the role menu, and set `members of <count>` to 100. Read the filtered total from the footer. Traverse every page and collect each row's Discord username and display name.

Prefer semantic structure over generated class names:

```js
() => [...document.querySelectorAll('[role="row"]')].map(row => {
  const avatar = row.querySelector('td:nth-of-type(2) [role="img"][aria-label]')
  const cell = row.querySelector('td:nth-of-type(2)')
  return {
    discordUsername: avatar?.getAttribute('aria-label') || null,
    visibleNameCell: cell?.innerText || null
  }
})
```

Inspect one row before relying on the second table cell because Discord can change its DOM. Do not click role chips or action buttons.

## Extract X connections

Open a full profile by clicking the member-name container in the second table cell. Wait for the dialog to contain the exact Discord username, then wait for its details to settle.

Read all connection anchors only from the dialog:

```js
dialog => {
  const urls = [...dialog.querySelectorAll('a[href]')].map(anchor => anchor.href)
  const xUrls = [...new Set(
    urls.filter(url => /^https:\/\/x\.com\/[A-Za-z0-9_]+\/?$/.test(url))
  )]
  return {
    xUrls,
    xHandles: xUrls.map(url => new URL(url).pathname.split('/').filter(Boolean)[0])
  }
}
```

Use this wait pattern:

```js
async () => {
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
  const waitFor = async (predicate, timeout = 2000) => {
    const end = Date.now() + timeout
    while (Date.now() < end) {
      const value = predicate()
      if (value) return value
      await sleep(50)
    }
    return null
  }
  const discordUsername = 'example_user'
  const dialog = await waitFor(() => {
    const current = document.querySelector('[role="dialog"]')
    return current?.innerText.includes(discordUsername) ? current : null
  })
  if (!dialog) return {status: 'discord_profile_unavailable'}
  await sleep(1500)
  if (dialog.innerText.includes('Unable to load parts of profile')) {
    return {status: 'discord_profile_unavailable'}
  }
  return {status: 'loaded'}
}
```

Close the current profile and wait until the dialog disappears before opening the next row. A stale dialog can shift one member's X handle onto the next member.

If a successfully loaded profile has no exact X connection, close it, reopen the same member once, wait another 1.5 seconds, and read all anchors again. Classify `missing_connection` only when both settled reads have no X connection.

Keep bio links separate. A `twitter.com/<handle>` or `x.com/<handle>` URL in `Bio` without a visible `Connections` section is `bio_link_only`, not a verified Discord X connection.

## Detect failed profile loads

Treat all of these as a stop condition:

- profile text contains `Unable to load parts of profile`
- the profile dialog never appears
- the dialog does not contain the expected Discord username
- a recent profile request returns 429
- Cloudflare shows error 1015
- the browser tool times out before returning the batch

Do not use `get_network_request` on an authenticated request because it can expose authorization headers. Use the network request list, visible profile error text, or normal UI state without opening raw request details.

Return only counts, affected Discord usernames, and the retry interval. Resume the interrupted row after the interval expires.

## Check X follow relationships

Navigate to the exact connected handle:

```text
https://x.com/<handle>
```

Confirm the page is a loaded profile for the expected handle. Read visible profile text and classify:

- `following`: `フォローされています` or `Follows you` is present
- `not_following`: the public profile loads successfully and neither phrase is present
- `x_account_unavailable`: X shows nonexistent or suspended account UI
- `protected`: posts are protected and the relationship badge cannot be confirmed
- `unchecked`: the page or relationship badge does not finish loading

Use the X UI by default. Do not replay internal requests, extract tokens, or use relationship APIs unless the user explicitly authorizes the fast path below.

## Use the authorized X internal API fast path

Use this path only when the user explicitly authorizes X internal Web API use. Keep the selected page on `x.com` in the user's logged-in Chrome profile.

First load one known follower and one known non-follower through the visible X UI.

Prefer the read-only friendship endpoint:

```text
/i/api/1.1/friendships/show.json?source_screen_name=<organizer>&target_screen_name=<candidate>
```

Call it from the X page context with `credentials: 'include'`. Read the CSRF cookie only inside the evaluated function and pass it in `x-csrf-token`. Never return the CSRF value, cookies, authorization headers, or raw response bodies.

Classify `relationship.source.followed_by === true` as `following` and `false` as a proposed `not_following`. Verify that this field returns `true` for the known follower and `false` for the known non-follower before batching.

Return only:

```js
{
  targetScreenName,
  httpStatus,
  actualScreenName: body?.relationship?.target?.screen_name,
  followedBy: body?.relationship?.source?.followed_by
}
```

Process bounded batches and checkpoint every completed batch. A practical starting point is 100 handles with at most ten concurrent reads. Stop if a batch contains HTTP 429. Preserve successful rows, leave 429 rows unchecked, and read only `x-rate-limit-remaining` and `x-rate-limit-reset` from the response. Resume after the reset epoch.

If `friendships/show` is unavailable, use the network request list without opening raw request details to find the current `UserByScreenName` GraphQL operation URL, operation hash, variables, features, and field toggles. Do not hardcode an old operation hash.

Call the current GraphQL operation from the X page context with the same credential discipline.

Return only these fields:

```js
{
  screenName,
  httpStatus,
  typename: result?.__typename,
  actualScreenName: result?.core?.screen_name,
  followedBy: result?.relationship_perspectives?.followed_by,
  protected: result?.privacy?.protected
}
```

Require the known follower to return `followedBy: true` and the known non-follower to return `followedBy: false` before using the GraphQL fallback. Start with 40 handles and at most six concurrent reads.

Treat `followedBy: false` as a proposed non-follower. Re-open every proposed non-follower in the visible X UI and confirm the expected handle loads without `フォローされています` or `Follows you` before reporting.

Check candidate non-followers a second time individually before reporting them.

## Reconcile results

Normalize handles with:

```js
value => value.replace(/^@/, '').toLowerCase()
```

Require:

```text
filtered role total
= confirmed followers
+ confirmed non-followers
+ missing Discord connections
+ unavailable Discord profiles
+ unavailable X accounts
+ protected accounts
+ unchecked rows
```

If the equation does not balance, locate duplicates and missing Discord usernames before reporting.

Also reconcile connected Discord members, total X connection links, and unique X handles separately. One member can expose multiple X accounts, and multiple Discord members can expose the same X account.
