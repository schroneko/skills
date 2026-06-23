---
name: onepassword-environment-secrets
description: Add, update, and verify environment variables in 1Password Environments. Use when the user asks to put secrets, API keys, credentials, tokens, partner tags, or project env vars into 1Password Environments, or asks to use op run with an Environment.
---

# 1Password Environment Secrets

Use this skill to place project environment variables into a 1Password Environment without exposing secret values in chat, logs, screenshots, or repository files.

## Core rules

- Prefer 1Password Environments over vault items for project env vars when the user asks for Environments.
- Do not use `op item list`, `op item get`, vault item secret references, or old dedicated token flows as substitutes.
- Do not stop just because `op environment` lacks a write command. Use the 1Password desktop app UI or another available 1Password Environment tool to complete the mutation.
- Do not reveal, print, summarize, screenshot, or paste secret values into chat.
- Do not commit or leave temporary files containing secrets.
- If a value is unavailable, derive it from the provided local artifact only when the user explicitly provided that artifact as the source of truth.

## Fast path

1. Identify the target Environment.
   - If the user names one, use it.
   - If 1Password is already open to an Environment, treat that Environment as the target unless the user said otherwise.
   - If no target is discoverable, ask for the Environment name or ID.
2. Identify variables to add or update.
   - Use exact variable names requested by the user or required by the target tool.
   - For credentials CSV files, parse only the required fields and never print values.
3. Check for existing variables by name in the Environment UI before adding.
4. Add or update variables in 1Password Environments.
5. Save the Environment.
6. Verify by visible variable names only or with `op environment read <environment-id>` if an ID is available and values remain masked.
7. Delete any temporary secret-bearing files immediately.

## CLI checks

Use these commands for read-only orientation:

```sh
op --version
op environment --help
op environment read --help
op run --help
```

Use `op environment read <environment-id>` only when an Environment ID is known. It may print variables; rely on 1Password masking and do not relay values.

Use `op run --environment <environment-id> -- <command>` to validate a command can receive Environment variables. Do not add fallback env vars outside 1Password unless the user explicitly asks.

## Desktop app workflow

Use Computer Use when the 1Password desktop app is required.

1. Open or focus 1Password.
2. Navigate to Developer > Environments > target Environment.
3. On Variables, search for the variable prefix to avoid duplicates.
4. Prefer Import `.env` file for multiple variables.
5. If importing:
   - Create the temporary `.env` under the current task `work/` directory with mode `0600`.
   - Include only the variables requested or required.
   - Select Import `.env` file in 1Password.
   - Choose the temporary file.
   - Confirm the imported variable names are shown.
   - Click Save.
   - Delete the temporary file.
6. If manually adding:
   - Click New variable.
   - Enter name and value.
   - Repeat for each variable.
   - Click Save.

## Temporary file pattern

Use a deterministic local script or command that does not print secrets. The temporary file path must be under `work/` for projectless tasks or the repository-local scratch area for repo tasks.

After importing, verify deletion with `ls -l <temp-file>`. A "No such file or directory" result is expected after cleanup.

## Reporting

Report only:

- Target Environment name if visible.
- Variable names added or updated.
- Verification performed.
- Temporary secret file cleanup status.

Do not report secret values, partial values, lengths, encoded forms, clipboard contents, or screenshots showing revealed values.
