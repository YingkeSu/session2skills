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

## Completion Report

Before finishing, write:

```text
.session2skills/worker-runs/<task>/completion-report.md
```

Use `docs/agents/templates/worker-completion-report.md`.

If blocked, write a blocked report using
`docs/agents/templates/blocked-report.md` instead of expanding scope.
