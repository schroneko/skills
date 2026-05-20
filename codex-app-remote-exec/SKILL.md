---
name: codex-app-remote-exec
description: Run commands on another Mac or host already connected to the local Codex App through the Codex App remote-control bridge. Use when direct SSH, VPN, or Tailscale is unavailable but Codex App still has a connected remote-control environment, or when a user asks to run commands via Codex App instead of the network path.
---

# Codex App Remote Exec

Use the local Codex App renderer bridge to send `command/exec` requests to a connected remote-control host. This is the fast path when the remote host is visible to Codex App but not reachable by normal network commands.

Do not publish machine IP addresses in notes, skills, logs, examples, or final reports. Hostnames such as `mymacstudio` are acceptable when the user has already named them.

## Fast Path

1. Start or reuse a Codex App instance with Chrome DevTools Protocol enabled:

```bash
open -na /Applications/Codex.app --args --remote-debugging-port=9223
```

2. Find the remote-control host id from recent Codex App logs or thread metadata. It usually looks like:

```text
remote-control:env_<opaque_id>
```

3. Run a harmless probe:

```bash
node scripts/remote-exec.js --host-id 'remote-control:env_<opaque_id>' -- /bin/hostname
```

4. Run the real command through `/bin/zsh -lc` when shell features are needed:

```bash
node scripts/remote-exec.js --host-id 'remote-control:env_<opaque_id>' -- /bin/zsh -lc '
cd /path/to/repo
git status --short
'
```

Prefer one remote command that performs the full fix and prints verification sections. Avoid running a direct SSH retry loop first when Codex App remote-control is already known to be connected.

## Host Discovery

First check whether the user or current thread already contains a `remote-control:env_...` host id. If not, search local Codex App logs and application support files for `remote-control:env_` and nearby hostnames.

Use commands such as:

```bash
rg 'remote-control:env_' "$HOME/Library/Logs" "$HOME/Library/Application Support/Codex"
```

If multiple ids exist, probe each candidate with `/bin/hostname` and use the one that returns the expected host. Do not record or expose IP addresses found in unrelated logs.

## Verification Pattern

For operational fixes, make the remote command print explicit sections:

```bash
/bin/zsh -lc '
echo "=== host ==="
/bin/hostname
echo "=== repo ==="
/usr/bin/git -C /path/to/repo rev-parse --show-toplevel
echo "=== fix ==="
command-that-fixes-the-issue
echo "=== verification ==="
command-that-confirms-the-state
'
```

After remote-control succeeds, verify the ordinary path the user cares about, such as:

```bash
ssh my-host /bin/hostname
```

Report only the relevant command outcomes. Redact IP addresses from copied status output.

## Failure Handling

- If the local DevTools `/json/list` endpoint is unavailable, launch a separate Codex App instance with `--remote-debugging-port=9223`.
- If `mcp-response` does not arrive, confirm the app page is `app://-/index.html`, the host id is current, and the remote host is still connected in Codex App.
- If `command/exec` returns a non-zero exit code, report stdout and stderr summaries and then fix the underlying command.
- If the remote command repaired the network path, stop any temporary retry automation created for the outage.

## Resource

Use `scripts/remote-exec.js` to send `command/exec` through the Codex App renderer bridge without rewriting CDP boilerplate.
