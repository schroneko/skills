# skills

Reusable skills for Claude Code and Codex CLI. Each directory contains one skill.

## Install

```sh
npx skills add schroneko/skills -g -a claude-code -a codex --skill '*' --full-depth -y
```

## Rebuild

```sh
npx skills add schroneko/skills -g -a claude-code -a codex --skill '*' --full-depth -y
```

Use `npx skills` only.

`~/.agents/skills` is the global installed skills directory. `~/.claude/skills` should be symlinks to `~/.agents/skills`. If `npx skills list` shows Cline for entries under `~/.agents/skills`, treat it as shared-path detection, not as a target agent for this repository.
