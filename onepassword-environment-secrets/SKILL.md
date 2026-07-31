---
name: onepassword-environment-secrets
description: Add, update, and verify environment variables in 1Password Environments. Use when the user asks to store API keys, credentials, tokens, partner tags, or project environment variables in 1Password Environments.
---

# 1Password Environment Secrets

Store project environment variables in the existing 1Password Environment without exposing secret values in chat, logs, screenshots, repositories, or synchronized files.

## Canonical configuration

- Environment: `.env`
- Environment ID file: `~/.config/op/environment-id`
- Service account: `mac-studio-development`
- Service account token file: `~/.config/op/service-account-token`
- Token file mode: `600`
- Authentication variables: `OP_ENVIRONMENT_ID`, `OP_SERVICE_ACCOUNT_TOKEN`

The Environment stores the variables. The service account only authenticates read access and does not contain variables itself.

## Core rules

- Use 1Password Environments instead of vault items.
- Do not use `op item`, `op://` references, `.env.1password`, `op signin`, Touch ID, app integration, or Keychain.
- Never print, reveal, summarize, screenshot, or paste secret values.
- Never store secrets in a repository, synchronized directory, shell configuration, command history, or log.
- Do not fall back to vault items when Environment access fails.
- Resolve the default Environment from `OP_ENVIRONMENT_ID`.
- Check existing variable names before adding or updating them.

## Read-only orientation

Verify that the active CLI build supports Environments and that authentication uses a service account.

```sh
op environment --help
op run --help
op whoami --format json
```

`op whoami` must report `SERVICE_ACCOUNT`. If it does not, inspect the local token file, its permissions, shell loading, and the CLI build. Do not run `op signin`.

Verify Environment access without returning its contents.

```sh
op environment read "$OP_ENVIRONMENT_ID" >/dev/null
```

Verify one required variable without returning its value.

```sh
op run --environment "$OP_ENVIRONMENT_ID" -- sh -c 'test -n "$OPENAI_API_KEY"'
```

## Add or update variables

1. Identify the exact variable names and the authorized source of each value.
2. Open the existing logged-in 1Password.com session in Chrome.
3. Open Developer, Environments, then `.env`.
4. Inspect variable names without revealing their values.
5. Update an existing variable or add a missing variable.
6. Save the Environment.
7. Verify access through `op run --environment "$OP_ENVIRONMENT_ID"`.

If variable editing is only available in the desktop app, stop before OS interaction and ask the user to perform the required UI step. Do not use Computer Use.

## Temporary files

Prefer direct entry and avoid temporary files. When the user explicitly authorizes file import:

- Create the file outside repositories and synchronized directories.
- Use a dedicated temporary directory.
- Set the file mode to `600`.
- Include only the requested variables.
- Delete it immediately after a successful import.
- Verify that it no longer exists.

## Reporting

Report only:

- Target Environment name.
- Variable names added or updated.
- Access verification result.
- Temporary file cleanup result when applicable.

Do not report values, partial values, lengths, encoded forms, clipboard contents, or screenshots containing revealed values.
