---
name: codex
description: Codex CLI (codex exec) を非対話的に呼び出す。GPT-5.4 によるコード実装、レビュー、設計分析に使用する。「codex で実装して」「codex でレビュー」「Codex に聞いて」などのリクエストで使用する。
---

You invoke OpenAI Codex CLI in headless (non-interactive) mode from within Claude Code using `codex exec`.
Use GPT-5.4 for code implementation, review, architecture analysis, security checks, and other tasks.

## Prerequisites

- `codex` CLI is installed and authenticated (`codex login` or `OPENAI_API_KEY` set)
- The working directory should be a git repository (or use `--skip-git-repo-check`)

## Modes

### Review mode (read-only)

For code review, analysis, second opinions. Codex cannot modify files.

```
codex exec --sandbox read-only --ephemeral [OPTIONS] "PROMPT"
```

### Implementation mode (workspace-write)

For code generation and implementation. Codex can create and modify files in the workspace.

```
codex exec --full-auto --ephemeral [OPTIONS] "PROMPT"
```

`--full-auto` is equivalent to `--sandbox workspace-write` with auto-approval of file writes.

## Common flags

| Flag                    | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `--ephemeral`           | Do not persist session to disk (always include)            |
| `-m MODEL`              | Override model (default: gpt-5.3-codex)                    |
| `--skip-git-repo-check` | Allow running outside a git repo                           |
| `-C DIR`                | Set working directory                                      |
| `-o FILE`               | Write final message to a file                              |
| `--json`                | Output JSON Lines event stream                             |
| `--output-schema FILE`  | Force structured output with JSON Schema                   |
| `-i IMAGE`              | Attach image file to the prompt                            |
| `-c key=value`          | Override config (e.g. `-c model_reasoning_effort="xhigh"`) |

## Workflow

### For implementation

1. Identify the files/features to implement
2. Write a detailed prompt with requirements, file paths, and design constraints
3. Run `codex exec --full-auto --ephemeral -C PROJECT_DIR "PROMPT"` via Bash (timeout: 300000ms)
4. Verify the generated files with Read tool
5. Run tests/linting to validate quality
6. Report results to the user

### For review

1. Parse the user's request to determine the task type
2. Run `codex exec --sandbox read-only --ephemeral "PROMPT"` via Bash (timeout: 120000ms)
3. Present the result to the user
4. If the user wants to act on suggestions, implement them

## Built-in review command

```
codex exec review
```

Reviews the current diff against the base branch without needing a custom prompt.

## Implementation prompt tips

- Include the full file path where code should be written
- Reference existing files that Codex should read for context
- Specify the language, framework, and coding style
- Include type signatures, interfaces, or examples from the codebase
- Be specific about error handling and edge cases
- One task per invocation for best results

## Important notes

- Set timeout to 120000-300000ms for `codex exec` calls (implementation takes longer)
- Progress logs go to stderr, final answer goes to stdout
- Token usage is shown at the end of the output
- If the user has ChatGPT Plus/Pro, Codex usage is included in the subscription
- If using API key, each call consumes OpenAI API credits
- `--dangerously-bypass-approvals-and-sandbox` はサンドボックスを無効化し、ファイルシステム全体への書き込みを許可するため使わない
- Codex requires a git repo by default; add `--skip-git-repo-check` for non-repo directories
