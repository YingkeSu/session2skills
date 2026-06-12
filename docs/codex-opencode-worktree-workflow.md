# Codex + OpenCode Worktree Workflow

## Purpose

This workflow lets Codex act as the planner, dispatcher, reviewer, and integrator while OpenCode workers implement isolated tasks in separate Git worktrees.

It is useful when a feature can be split across clear ownership boundaries. It is risky when several workers need to edit the same shared files before the contracts are stable.

## Roles

Codex owns:

- Requirements clarification.
- Task graph and dependency planning.
- Shared contracts and interfaces.
- Worktree creation.
- Worker task packets.
- Review and merge order.
- Conflict resolution.
- Final verification.

OpenCode workers own:

- Implementation inside one assigned worktree.
- Focused tests for that task.
- Local verification output.
- A completion report with changed files, commands run, and known risks.

## Communication Contract

Codex and OpenCode should not depend on implicit chat memory. Communication must happen through durable artifacts that Codex can inspect after each worker run.

Use four communication channels:

```text
task packet        Codex -> OpenCode
worktree branch    OpenCode -> Codex
completion report  OpenCode -> Codex
JSON/session logs   OpenCode -> Codex audit trail
```

Codex sends work through a task packet file. The packet is the source of truth for the worker's objective, allowed files, verification commands, and completion report format.

OpenCode returns work through:

- Git diff in its assigned branch.
- A completion report file.
- Command output from verification.
- Optional `opencode run --format json` event logs.
- Optional exported OpenCode session JSON for audit or retry.

Codex decides whether the task is accepted. A worker can report completion, but only Codex can mark the integration task done.

Recommended artifact layout:

```text
.session2skills/tasks/
  skill-intent.md
  skill-store.md
  evaluate-command.md

.session2skills/worker-runs/
  skill-intent/
    opencode-events.jsonl
    completion-report.md
    verification.txt
  skill-store/
    opencode-events.jsonl
    completion-report.md
    verification.txt
```

Completion report template:

```md
# Completion Report: <task name>

## Summary

<What changed.>

## Files Changed

- <path>: <short reason>

## Verification

- `<command>`: pass/fail

## Contract Notes

- Did not edit outside allowed scope: yes/no
- Added or changed tests: yes/no
- Generated artifacts excluded from commit: yes/no

## Risks

- <risk or "None known">

## Handoff

<Anything Codex should inspect carefully before merge.>
```

If OpenCode is blocked, it should write a blocked report instead of broadening scope:

```md
# Blocked Report: <task name>

## Blocker

<What prevents completion.>

## Evidence

<Files, errors, command output, or missing decision.>

## Suggested Next Step

<One concrete recommendation.>
```

## Preconditions

Before dispatching workers:

- The repository has a clean or understood working tree.
- Shared contracts are written down before parallel implementation starts.
- Tasks are sliced so each worker mostly owns different files.
- Verification commands are known.
- The base branch is fixed.

For this project, prefer a contract-first first task before launching a wide implementation wave.

## Safety Rules

Run this before every Git operation:

```bash
git rev-parse --show-toplevel
```

The output must equal:

```text
/Users/suyingke/Programs/OHO/session2skills
```

If it does not match, stop.

Additional rules:

- Create worktrees only from the verified repository root.
- Use one branch per worktree.
- Run at most one OpenCode worker process per worktree at a time.
- Do not create worktrees inside another repository.
- Run `git worktree list -v` before dispatch and before cleanup.
- Do not run `npm run build` concurrently with e2e tests that read `dist/`.
- Merge worker branches one at a time.
- Run verification after each merge into the integration branch.
- Never let workers decide that the full project is complete. Workers only submit evidence.

## Directory Convention

Use sibling worktrees outside the main repository:

```text
/Users/suyingke/Programs/OHO/
  session2skills/
  session2skills-skill-intent/
  session2skills-skill-store/
  session2skills-evaluate/
  session2skills-curate/
  session2skills-evolve/
```

Branch names should use the `codex/` prefix:

```text
codex/skill-intent
codex/skill-store
codex/evaluate-command
codex/curate-dry-run
codex/evolve-dry-run
codex/integration-skill-lifecycle
```

## Task Packet Template

Each OpenCode worker should receive a self-contained task packet.

```md
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

## Existing Context

- Read `AGENTS.md`.
- Read `docs/skill-lifecycle-design.md`.
- Relevant existing files:
  - <path>

## Implementation Requirements

- <requirement>
- <requirement>

## Tests / Verification

Run:

```bash
npm run typecheck
```

Also run focused tests if you add or change testable behavior.

## Completion Report

Return:
- Summary of changes.
- Files changed.
- Commands run and whether they passed.
- Remaining risks or follow-up work.
```

## Dispatch Procedure

### 1. Verify Repository

```bash
cd /Users/suyingke/Programs/OHO/session2skills
git rev-parse --show-toplevel
git status --short
git worktree list -v
```

Stop if repository ownership is wrong.

If there are uncommitted changes, Codex must decide whether they are part of the work, should be committed first, or should stay only in the main worktree.

### 2. Create Integration Branch

```bash
git switch -c codex/integration-skill-lifecycle
```

If the branch already exists, switch to it and inspect its state.

### 3. Create Worker Worktrees

Create each worktree from the integration branch or a fixed base commit.

```bash
git worktree add -b codex/skill-intent ../session2skills-skill-intent codex/integration-skill-lifecycle
git worktree add -b codex/skill-store ../session2skills-skill-store codex/integration-skill-lifecycle
git worktree add -b codex/evaluate-command ../session2skills-evaluate codex/integration-skill-lifecycle
```

Verify:

```bash
git worktree list -v
```

### 4. Run OpenCode Workers

Use `opencode run --dir <worktree> --format json` for automation-friendly output.

Dispatch rule:

- Finish creating the full wave of worktrees and task packets before doing any worker-result review.
- Launch at most one OpenCode worker per worktree.
- After launching a wave, do not sit in a polling loop on the first worker while sibling worktrees are still undispatched.
- Batch first, collect later: dispatch the whole wave, then return for result harvesting and integration review.

Example:

```bash
opencode run \
  --dir /Users/suyingke/Programs/OHO/session2skills-skill-intent \
  --format json \
  --title "s2s skill intent schema" \
  "$(cat /path/to/task-packet.md)"
```

In practice, Codex can write task packets under a planning directory and pass each file to OpenCode with `--file`:

```bash
opencode run \
  --dir /Users/suyingke/Programs/OHO/session2skills-skill-intent \
  --format json \
  --title "s2s skill intent schema" \
  --file /Users/suyingke/Programs/OHO/session2skills/.session2skills/tasks/skill-intent.md \
  "Implement the attached task packet. Follow the repository AGENTS.md instructions."
```

For risky first runs, omit `--dangerously-skip-permissions` and let OpenCode ask for approvals. Use automated approval only for trusted local task batches.

Recommended background launch pattern:

```bash
nohup opencode run \
  --dir /Users/suyingke/Programs/OHO/session2skills-skill-intent \
  --format json \
  --print-logs \
  --title "s2s skill intent schema" \
  --file /Users/suyingke/Programs/OHO/session2skills-skill-intent/.session2skills/tasks/skill-intent.md \
  "Implement the attached task packet. Follow AGENTS.md and the task packet exactly." \
  > /Users/suyingke/Programs/OHO/session2skills-skill-intent/.session2skills/worker-runs/skill-intent/opencode-events.jsonl 2>&1 &
```

This keeps each worker's audit trail isolated inside its own worktree and avoids mixing logs from multiple workers.

### 5. Worker Verification

Each worker should run focused checks in its own worktree.

Recommended minimum:

```bash
npm run typecheck
```

If the task touches output behavior:

```bash
npm test
```

Avoid running multiple `npm run build` or e2e flows in parallel if they share generated paths.

### 6. Codex Review

For each worker branch:

```bash
cd <worker-worktree>
git status --short
git diff --stat
git diff
npm run typecheck
```

Codex reviews:

- Scope control.
- Contract compatibility.
- Test coverage.
- Generated artifacts that should not be committed.
- Whether changes conflict with other branches.

### 7. Integration Merge

Merge one worker branch at a time into the integration branch.

```bash
cd /Users/suyingke/Programs/OHO/session2skills
git rev-parse --show-toplevel
git switch codex/integration-skill-lifecycle
git merge --no-ff codex/skill-intent
npm run typecheck
```

Repeat for each branch.

Run broader verification after all merges:

```bash
npm run build
npm test
```

Run e2e only when needed and after build:

```bash
npm run test:e2e
```

### 8. Final Review

Before creating a PR or merging to main:

```bash
git status --short
git diff --stat main...HEAD
npm run typecheck
npm run build
npm test
```

Codex prepares a final summary:

- What changed.
- Which worker branches contributed.
- Verification commands and results.
- Remaining risks.

### 9. Cleanup

Only after changes are merged or intentionally abandoned:

```bash
git worktree list -v
git worktree remove ../session2skills-skill-intent
git worktree remove ../session2skills-skill-store
git worktree remove ../session2skills-evaluate
git worktree prune
```

Do not remove worktrees with unmerged work unless the branch has been pushed, preserved, or explicitly abandoned.

## Recommended First Wave

Do not launch all implementation tasks at once. Start with a contract branch.

Wave 0:

- Add `SkillIntent`, `SkillEvaluation`, `SkillPatch`, and `EvolutionCandidate` type contracts.
- Add fixture examples.
- Add focused type/schema tests.

Wave 1:

- Skill Store persistence and manifests.
- `evaluate` command deterministic gates.
- SkillIntent generation from merged claims.

Recommended dispatch order for Wave 1:

1. Create the integration branch and all Wave 1 worktrees.
2. Write all three task packets.
3. Launch one OpenCode worker per worktree.
4. Update SOP or planning notes if the wave exposed orchestration issues.
5. Only then begin result collection and Codex review.

Wave 2:

- `curate --dry-run` inventory and report.
- `evolve --dry-run` eval case and candidate scaffolding.

Wave 3:

- Curator apply with snapshots.
- Evolution candidate patch apply.
- Optional LLM review and candidate scoring.

## When Not To Use This Workflow

Avoid this workflow when:

- The task is small enough for one agent.
- The main uncertainty is product design rather than implementation.
- Several workers must edit the same shared file heavily.
- Tests are slow, stateful, and cannot be isolated.
- The repository has unresolved Git state.

In those cases, Codex should implement serially or run only parallel read/review agents.
