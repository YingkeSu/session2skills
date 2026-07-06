# Codex + Claude Worktree Workflow

This workflow is for Codex-led implementation waves where Claude Code workers
make isolated changes in sibling Git worktrees. It is intended for medium or
large tasks that can be split by ownership boundary.

## Roles

Codex owns:

- Requirements clarification and design brief.
- Shared contracts and task slicing.
- Figma or browser-based design blueprints when useful.
- Worktree creation and worker dispatch.
- Diff review, merge order, and conflict resolution.
- Final browser QA and verification.

Claude workers own:

- One task in one assigned sibling worktree.
- Focused implementation inside the allowed scope.
- Local verification commands for that task.
- A completion or blocked report.

Claude reviewers own:

- Fresh-context review after integration.
- Bugs, regressions, missing tests, accessibility, desktop fit, and scope drift.
- No global completion decision.

## Durable Communication

Agents must not depend on implicit chat memory. Use files as the contract:

```text
.session2skills/tasks/<task>.md
.session2skills/worker-runs/<task>/claude-events.jsonl
.session2skills/worker-runs/<task>/completion-report.md
.session2skills/worker-runs/<task>/verification.txt
```

Codex decides whether work is accepted. A worker can report completion, but only
Codex integrates and declares the full wave done.

## Handoff Discovery

Do not require a file literally named `handoff`.

When a user asks to continue from a handoff or recent plan:

1. Look first in `.session2skills/tasks/` for the newest brief, especially
   `*brief.md`.
2. Then inspect the newest task packets in `.session2skills/tasks/`.
3. If no handoff-named file exists, treat the latest brief plus task packets as
   the durable handoff.
4. If task packets reference missing context files, check the integration branch
   for those files before blocking. If Codex copies a missing context file into a
   worker worktree only to unblock reading, mark it as non-slice context and
   remove it from the worker diff before integration.

## Safety Rules

Before every Git operation, run:

```bash
git rev-parse --show-toplevel
```

For Git operations in the main integration worktree, the output must be exactly:

```text
/Users/suyingke/Programs/OHO/session2skills
```

For Git operations in a worker worktree, the output must be exactly the
absolute `Worktree:` path declared in that worker's task packet.

Stop if the path does not match the operation you intend. Sibling worktrees are
separate Git worktrees; their `--show-toplevel` output should not be the main
repository path.

Additional rules:

- Create sibling worktrees under `/Users/suyingke/Programs/OHO/`.
- Do not create worktrees inside this repository.
- Use one worker process per worktree.
- Dispatch the full wave before collecting results.
- Merge worker branches one at a time into an integration branch.
- Run verification after each merge.
- Do not run build or e2e flows concurrently when they read or write `dist/`.
- Never let workers edit the main worktree.
- Prefer diff-only workers for broad UI waves: workers edit files and write
  reports, but Codex stages, commits, merges, and fixes integration issues.
- If a task explicitly uses branch-commit workers instead, state that in the
  packet. Never mix diff-only and branch-commit expectations implicitly.

## Dispatch Procedure

Do not launch implementation workers until the user explicitly starts an
implementation wave. Preparing the workflow, task packets, worktrees, and
verification gates is separate from starting worker execution.

1. Verify repository state:

```bash
cd /Users/suyingke/Programs/OHO/session2skills
git rev-parse --show-toplevel
git status --short
git worktree list -v
```

2. Create or switch to an integration branch:

```bash
git switch -c codex/integration-ui-cockpit
```

3. Create one sibling worktree per worker:

```bash
git worktree add -b codex/ui-shell-generate ../session2skills-ui-shell-generate codex/integration-ui-cockpit
git worktree add -b codex/ui-dashboard ../session2skills-ui-dashboard codex/integration-ui-cockpit
git worktree add -b codex/ui-run-detail ../session2skills-ui-run-detail codex/integration-ui-cockpit
git worktree add -b codex/ui-evidence-polish ../session2skills-ui-evidence-polish codex/integration-ui-cockpit
```

4. Copy or create task packets inside each worktree.

5. Preflight each worker worktree before dispatch:

```bash
cd <worker-worktree>
git rev-parse --show-toplevel
test "$(git rev-parse --show-toplevel)" = "<worker-worktree>"
test -f .session2skills/tasks/<task>.md
test -f docs/agents/codex-claude-workflow.md
test -f docs/agents/templates/worker-completion-report.md
```

If a required context file is missing only because the worker branch is behind
the integration branch, either fast-forward/recreate the worktree from the
integration branch or copy the file as temporary context and remove it from the
worker diff before commit.

6. Run each Claude worker from its assigned worktree. Do not use Claude Code's
`--file` flag for local task packets; in current CLI help it is not a plain
local-file prompt input.

Prefer Codex-managed foreground/PTTY sessions for long-running parallel workers.
They provide reliable output capture and process lifecycle tracking. Use
`nohup ... &` only after a local smoke test proves that the current shell leaves
non-empty logs and durable PIDs.

Claude Code can be slow on medium/large implementation slices. A healthy worker
may spend several minutes reading context, planning, editing, running tests, and
writing reports. Do not treat a quiet foreground session as stuck merely because
it has not returned within 1-3 minutes.

```bash
TASK_PACKET=/Users/suyingke/Programs/OHO/session2skills-ui-dashboard/.session2skills/tasks/ui-dashboard.md
LOG_DIR=/Users/suyingke/Programs/OHO/session2skills-ui-dashboard/.session2skills/worker-runs/ui-dashboard
mkdir -p "$LOG_DIR"
cd /Users/suyingke/Programs/OHO/session2skills-ui-dashboard
claude --print \
  --verbose \
  --output-format stream-json \
  --permission-mode auto \
  --name "s2s-ui-dashboard" \
  "$(cat "$TASK_PACKET")" \
  > "$LOG_DIR/claude-events.jsonl" 2>&1
```

Include these orchestration instructions unless the packet deliberately says
otherwise:

```text
- You are a Claude Code worker for this one slice only.
- Read the required context files. If a required file is absent, report it and
  continue with the copied context available in this worktree.
- Do not edit outside the task scope.
- Do not run git commit, git merge, git switch, git reset, or git push. Leave
  implementation changes in this worktree for Codex review and integration.
- Write the required completion or blocked report at the exact path in the
  packet.
- Write verification output to .session2skills/worker-runs/<task>/verification.txt.
```

After launch, perform one startup health check within 30-60 seconds:

- `claude-events.jsonl` exists and is non-empty.
- The process is still running or exited with a report.
- If the log is empty and the process exited, treat dispatch as failed and retry
  with a foreground/PTTY command instead of waiting.
- Once the log is non-empty and the foreground/PTTY session is still active,
  switch to coarse polling. Check every 5-10 minutes, or sooner only if Claude
  returns control or writes a completion/blocked report.
- Do not rely on `ps | grep <name>` as the only liveness signal; command-line
  matching can miss or misclassify Claude processes. Prefer the Codex-managed
  exec session status, report-file presence, and bounded log summaries.

## Polling Discipline

Avoid continuous polling. It wastes tokens and collapses useful context.

Recommended collection pattern:

- Launch the full approved wave.
- Record process IDs and log paths.
- Wait a coarse interval before checking, such as 5-10 minutes for implementation
  workers.
- Prefer one bounded status read:
  - process still running or exited
  - `git status --short`
  - completion or blocked report exists
  - last 20-40 non-thinking log lines
- Do not stream full event logs into Codex context. Claude event logs may contain
  very large tool-result payloads; summarize JSONL by extracting recent
  assistant text, tool names, compact tool-result prefixes, and final `result`
  events instead of tailing raw log lines directly.
- If the worker is actively editing or testing, keep waiting on the 5-10 minute
  cadence. Interrupt only after repeated coarse checks show no file changes, no
  meaningful tool activity, and no report.
- If a worker shows no file changes and no meaningful tool activity after a
  coarse interval, stop it and narrow the task packet before retrying.

## Integration

For each completed worker:

```bash
cd <worker-worktree>
git rev-parse --show-toplevel
git status --short
git diff --stat
git diff
npm run typecheck:web
```

Before committing a worker diff, remove temporary context files that were copied
only for dispatch. Confirm `git diff --check` and conflict-marker search are
clean. In diff-only mode, Codex owns the commit message and the staged file set.

Then integrate from the main repository:

```bash
cd /Users/suyingke/Programs/OHO/session2skills
git rev-parse --show-toplevel
git switch codex/integration-ui-cockpit
git merge --no-ff codex/<worker-branch>
npm run typecheck:web
```

After the full wave:

```bash
npm run typecheck:web
npm run typecheck:electron
npm run test:unit
npm run verify:web
```

If `npm run test:unit` enters real e2e files or produces no useful output for a
coarse interval, stop it and run the explicit non-e2e suite instead:

```bash
rg --files tests web/src -g '*.test.ts' -g '*.test.tsx' -g '!tests/e2e/**' | xargs npx vitest run
```

Record the substitution in the handoff.

Run `npm run electron:dev` or `npm run electron:smoke` when the environment is
ready for app-level smoke testing.

## Fresh-Context Review and Fix Pass

After all implementation workers are merged, dispatch one review-only Claude
worker from the integration worktree using the review task packet. It must write:

```text
.session2skills/worker-runs/<review-task>/completion-report.md
```

Review-only workers follow the same startup-health and coarse-polling rules as
implementation workers. A review that reads a broad diff and runs focused tests
can legitimately take several minutes; wait 5-10 minutes between checks after
the initial health check.

Review findings are not handoff prose; they are a fix queue:

- Blocker and high findings must be fixed before user acceptance, unless Codex
  explicitly documents a reason to defer.
- Medium and low findings may become follow-up polish.
- After a fix pass, rerun the focused tests for the finding and the acceptance
  gates affected by the change.

For frontend work, save browser QA artifacts when possible:

```text
.session2skills/worker-runs/<review-task>/screenshots/
  1024.png
  1280x800.png
  1440x900.png
```

If screenshots are not available, state that explicitly in the review report and
do not treat DOM/CSS inference as a visual sign-off.

## When Not To Use

Avoid this workflow when:

- The task is small enough for one agent.
- The primary uncertainty is product direction, not implementation.
- Multiple workers would heavily edit the same shared files.
- The repository has unresolved Git state.
- The change requires rapid visual iteration with a human after every slice.
