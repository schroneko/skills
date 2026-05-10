---
name: xurl-account-auth
description: Safely set up or repair xurl authentication for a specific X account without leaking secrets. Use when xurl has the wrong active account, app-only bearer auth is shadowing user-context auth, OAuth2 authorization fails before the consent screen, OAuth1 PIN flow is needed, or Codex must verify that xurl commands run as the intended X username.
---

# xurl Account Auth

Use this skill only for authentication setup and repair around `xurl`. For normal X API reads, writes, searches, posts, and media work, use the existing `xurl` skill.

Never modify the existing `xurl` skill for account-specific setup. Keep account-specific fixes here or in the user's local `~/.xurl`.

## Safety Rules

- Do not print, paste, summarize, or store secrets, bearer tokens, access tokens, token secrets, refresh tokens, or PINs in chat or docs.
- Do not authorize an app while the browser is logged into a different X account than the requested target username.
- Do not use sensitive `xurl` CLI flags with real secrets in agent-visible shell commands.
- Do not read `~/.xurl` into context. Inspect only structural metadata such as app names and token presence.
- Before replacing or rewriting `~/.xurl`, create a timestamped backup.

## Decision Flow

1. Check `xurl auth status`.
2. Identify the target app name and target X username from the user request or existing config.
3. Verify the browser's active X account before pressing any authorization button.
4. If OAuth2 authorization fails before the consent screen, treat it as an app/client configuration mismatch. Check whether the available identifier is an OAuth2 client ID or an X Consumer/API key.
5. If only a Consumer/API key and secret are available, use OAuth1 PIN flow.
6. Verify with `xurl whoami` and confirm the returned `username` equals the target username.

## Browser Account Check

When browser authorization is involved, use Computer Use to inspect the X UI before clicking authorize:

- The account switcher or authorization page header must show the target username.
- If the authorization page shows a different username, stop and switch accounts first.
- After switching, reload or restart the authorization flow. Do not reuse a request token created under the wrong account.

## OAuth1 PIN Flow

Use the bundled helper when the app entry already exists in `~/.xurl` with a Consumer/API key and secret:

```bash
uv run --with pyyaml python scripts/oauth1-pin-auth.py APP_NAME TARGET_USERNAME
```

The helper:

- reads the app credentials from `~/.xurl` without printing them
- opens the X OAuth1 authorization page
- asks for the displayed PIN
- refuses to save the token if the authorized screen name does not match `TARGET_USERNAME`
- stores the token in the `xurl` YAML shape:

```yaml
oauth1_token:
  type: oauth1
  oauth1:
    access_token: ...
    token_secret: ...
    consumer_key: ...
    consumer_secret: ...
```

If unqualified `xurl whoami` still uses app-only bearer auth, remove the app's `bearer_token` only after creating a backup and verifying in a copied HOME that this makes `xurl whoami` select user-context auth.

## Verification

Run these checks after saving tokens:

```bash
xurl auth status
xurl whoami
xurl "/2/users/me?user.fields=id,name,username,created_at,public_metrics"
```

Success means:

- default app is the intended app
- `oauth1: ✓` or `oauth2` user token is present
- `xurl whoami` returns the intended username
- no unrelated account name appears in active auth output
