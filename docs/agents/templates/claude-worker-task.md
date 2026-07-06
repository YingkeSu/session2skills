# Task: <short name>

## Repository

Worktree: <absolute worktree path>
Branch: <branch name>
Base branch: <base branch or commit>

## Objective

<One concrete outcome.>

## Scope

You may edit:

- <file or directory>

Avoid editing:

- <file or directory>

## Required Context

Read before editing:

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/agents/codex-claude-workflow.md`
- `docs/agents/ui-redesign-brief.md`
- `.session2skills/tasks/ui-redesign-brief.md` if present in the worktree
- <task-specific files>

## Implementation Requirements

- Preserve backend API contracts.
- Keep React + Vite + TypeScript.
- Do not introduce a large UI framework.
- Keep desktop Electron compatibility in mind.
- Preserve i18n keys or update both locales when text changes.
- Do not commit generated runtime output.
- Default to diff-only worker mode: do not run `git commit`, `git merge`,
  `git switch`, `git reset`, or `git push` unless Codex explicitly authorizes
  branch-commit mode for this task.
- If Codex copied missing context files into this worktree only for dispatch,
  do not include those files in the slice diff.

## Verification

Run focused checks for your slice. Minimum:

```bash
npm run typecheck:web
```

If tests cover your changed surface, run the focused test files. If your slice
touches shared behavior, run:

```bash
npm run test:unit
```

If `npm run test:unit` enters real e2e files or stalls because the local script
does not exclude them, stop it and run:

```bash
rg --files tests web/src -g '*.test.ts' -g '*.test.tsx' -g '!tests/e2e/**' | xargs npx vitest run
```

Record the substitution and reason in `verification.txt`.

## Completion Report

Before finishing, write:

```text
.session2skills/worker-runs/<task>/completion-report.md
```

Use `docs/agents/templates/worker-completion-report.md`.

If blocked, write a blocked report using
`docs/agents/templates/blocked-report.md` instead of expanding scope.
