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

## Safety Rules

Before every Git operation, run:

```bash
git rev-parse --show-toplevel
```

The output must be exactly:

```text
/Users/suyingke/Programs/OHO/session2skills
```

Stop if it differs.

Additional rules:

- Create sibling worktrees under `/Users/suyingke/Programs/OHO/`.
- Do not create worktrees inside this repository.
- Use one worker process per worktree.
- Dispatch the full wave before collecting results.
- Merge worker branches one at a time into an integration branch.
- Run verification after each merge.
- Do not run build or e2e flows concurrently when they read or write `dist/`.
- Never let workers edit the main worktree.

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

5. Run each Claude worker from its assigned worktree. Do not use Claude Code's
`--file` flag for local task packets; in current CLI help it is not a plain
local-file prompt input.

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

For long-running workers, wrap the command in `nohup ... &` only after the task
packet and log directory exist.

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
- Do not stream full event logs into Codex context.
- If a worker shows no file changes and no meaningful tool activity after a
  coarse interval, stop it and narrow the task packet before retrying.

## Integration

For each completed worker:

```bash
cd <worker-worktree>
git status --short
git diff --stat
git diff
npm run typecheck:web
```

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

Run `npm run electron:dev` or `npm run electron:smoke` when the environment is
ready for app-level smoke testing.

## When Not To Use

Avoid this workflow when:

- The task is small enough for one agent.
- The primary uncertainty is product direction, not implementation.
- Multiple workers would heavily edit the same shared files.
- The repository has unresolved Git state.
- The change requires rapid visual iteration with a human after every slice.
