---
name: onepassword-environment-secrets
description: Add, update, and verify environment variables in 1Password Environments. Use when the user asks to store API keys, credentials, tokens, partner tags, or project environment variables in 1Password Environments.
---

# 1Password Environment Secrets

Store project environment variables in the existing 1Password Environment without exposing secret values in chat, logs, screenshots, repositories, or synchronized files.

## Canonical configuration

- Environment: `.env`
- Environment ID file: `~/.config/op/environment-id`
- Environment selection variable: `OP_ENVIRONMENT_ID`
- CLI: stable 1Password CLI with `op run --environment` support
- Local authentication: the user's 1Password desktop app integration and approval, including app unlock or Touch ID when requested

The Environment stores the variables. A service account is not required for this local workflow. Do not provision, reuse, or restore service-account authentication unless the user explicitly authorizes it.

## Core rules

- Use 1Password Environments instead of vault items.
- Do not use `op item`, `op://` references, `.env.1password`, `op signin`, or Keychain.
- Never print, reveal, summarize, screenshot, or paste secret values.
- Never store secrets in a repository, synchronized directory, shell configuration, command history, or log.
- Do not fall back to vault items when Environment access fails.
- Resolve the default Environment from `OP_ENVIRONMENT_ID`.
- Use `op run --environment` directly, without custom aliases or wrappers.
- Do not copy credentials between hosts.
- Check existing variable names before adding or updating them.

## Read-only orientation

Verify the active CLI version and support for `op run --environment`. Stable CLI version 2.41.0 and later supports this workflow. Use `op whoami` when authentication identity needs confirmation; the local workflow does not require a `SERVICE_ACCOUNT` identity.

```sh
op --version
op run --help
op whoami --format json
```

Use the user's existing desktop app integration for authentication. If authentication fails, report the specific app approval or unlock step required. Do not switch to service-account tokens or `op signin`.

`op environment read` remains beta-only and is not required for normal Environment access. Do not install a beta CLI to use this skill. See the [official Environment CLI documentation](https://www.1password.dev/environments/read-environment-variables).

Verify Environment access without returning its contents.

```sh
op run --environment "$OP_ENVIRONMENT_ID" -- true
```

Verify one required variable without returning its value.

```sh
op run --environment "$OP_ENVIRONMENT_ID" -- sh -c 'test -n "$OPENAI_API_KEY"'
```

## Add or update variables

1. Identify the exact variable names and the authorized source of each value.
2. Prefer connected local 1Password MCP tools for inspecting names and adding or updating variables. Inspect their exact tool schemas before use and request names-only results without secret values.
3. If those tools are unavailable, open the existing logged-in 1Password.com session in Chrome, then Developer, Environments, and `.env`.
4. Inspect variable names without revealing their values.
5. Update an existing variable or add a missing variable within the user's authorized scope.
6. Save the Environment.
7. Verify access through `op run --environment "$OP_ENVIRONMENT_ID" -- true` and verify the requested variable's presence without returning its value.

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
