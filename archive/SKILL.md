---
name: archive
description: Archive only the current Codex App thread when the user invokes /archive or $archive to finish the current thread. Use the Codex App thread archive tool without passing a thread id so no other thread is archived.
---

# Archive

Archive the calling Codex App thread and stop. This skill is only for finishing the current thread.

## Rules

- Use this skill only when the user invokes `/archive`, invokes `$archive`, or clearly asks to archive the current Codex App thread with this skill.
- Archive only the calling thread.
- Call `set_thread_archived` with `archived: true` and omit `threadId`.
- Do not list, search, read, rename, pin, unarchive, send messages to, or archive any other thread.
- Do not pass a thread id, even if one is visible in context.
- Do not implement `/exit`, aliases, slash-command parsing, navigation, title changes, cleanup, commits, or any extra behavior.
- After the tool succeeds, reply with a short completion message only.

## Required Tool Call

```json
{"archived": true}
```

## Failure

If the archive tool is unavailable or fails, report only that the current thread could not be archived.
