# Skill Lifecycle Design

## Status

Draft accepted for planning. This document narrows the Hermes-inspired direction into a CLI-first design for `session2skills`.

The current product remains a local-first CLI. Layer 2 and Layer 3 are explicit user-triggered workflows, not background services. Layer 1 runtime learning is deferred until `session2skills` can run as a plugin inside another agent.

## Product Shape

`session2skills` should generate, evaluate, curate, and evolve agent skills from historical work sessions and local artifacts.

The design borrows three ideas from Hermes:

- Skills are procedural memory, not one-time summaries.
- A skill store needs lifecycle management: review, patch, merge, archive, and rollback.
- Evolution should use traces and evaluation cases to improve skill text over time.

The design does not copy Hermes' runtime shape. Hermes can learn while an agent is running. `session2skills` starts as an artifact-first CLI that learns from completed sessions.

## Layer Model

### Layer 0: Core Generation

Layer 0 turns historical sessions into a first skill.

Pipeline:

```text
sessions
  -> normalized sessions
  -> evidence index
  -> candidate claims
  -> merged claims
  -> SkillIntent
  -> SkillPlan
  -> Writer
  -> lint + verifier
  -> Skill Store
```

Existing implementation already covers most of this path:

- `src/analyze/run-analysis.ts` builds normalized sessions, evidence, rule claims, LLM claims, merged claims, profile, and skill plan.
- `src/generate/skill-plan.ts` turns merged claims into directives.
- `src/generate/composer.ts` composes grounded skill prose with an LLM and validates section/directive IDs.
- `src/generate/skill-lint.ts` performs hard quality gates.
- `src/harness/verifier.ts` verifies claim grounding and fabricated directives.

The missing concept is `SkillIntent`.

`SkillIntent` should describe what the generated skill is meant to help an agent do. This keeps the output from becoming a user-profile summary.

Suggested shape:

```ts
type SkillIntent = {
  schemaVersion: "skill-intent/v1";
  name: string;
  trigger: string;
  targetAgent: "generic" | "codex" | "claude" | "opencode";
  problemClass: string;
  workflow: Array<string>;
  constraints: Array<string>;
  validation: Array<string>;
  antiPatterns: Array<string>;
  evidenceClaimIDs: Array<string>;
  confidence: "high" | "medium" | "low";
};
```

Generation should write a skill into a Skill Store rather than treating `generated-skills/` as a final loose output directory.

Suggested store layout:

```text
.session2skills/skills/
  active/
    code-review/
      SKILL.md
      skill-manifest.json
      skill-intent.json
      claim-manifest.json
      provenance.json
      lineage.json
  archived/
  snapshots/
  reports/
```

### Layer 1: Runtime Learning

Deferred.

Layer 1 becomes relevant only when `session2skills` is embedded into another agent. It can then observe live tasks, identify reusable procedures, and write runtime usage telemetry.

This is tracked in GitHub issue #3.

### Layer 2: Curator CLI

Layer 2 maintains the skill store. It does not run continuously.

Primary commands:

```bash
session2skills curate --store .session2skills/skills --dry-run
session2skills curate --store .session2skills/skills --apply
session2skills curate rollback <snapshot-id>
```

Curator answers:

- Should this skill be kept?
- Is it stale, duplicated, too broad, or too narrow?
- Can it be patched without a full rewrite?
- Should multiple skills be merged?
- Should a skill be archived?

Curator flow:

```text
inventory
  -> deterministic gates
  -> LLM review
  -> patch/merge/archive plan
  -> human-readable report
  -> optional apply with snapshot
```

Curator actions:

```ts
type CuratorAction =
  | { kind: "keep"; skillID: string; reason: string }
  | { kind: "patch"; skillID: string; patch: SkillPatch; reason: string }
  | { kind: "merge"; sourceSkillIDs: Array<string>; targetSkillID: string; reason: string }
  | { kind: "archive"; skillID: string; reason: string }
  | { kind: "needs-human-review"; skillID: string; reason: string };
```

Patch actions should be targeted. The default should not be a full rewrite.

```ts
type SkillPatch = {
  schemaVersion: "skill-patch/v1";
  targetSection: string;
  reason: string;
  find: string;
  replace: string;
  claimIDs: Array<string>;
  risk: "low" | "medium" | "high";
};
```

Curator outputs:

```text
curator-report.json
curator-plan.json
patches/
snapshots/
```

Default mode should be `--dry-run`. `--apply` should create a snapshot before writing.

### Layer 3: Evolution CLI

Layer 3 optimizes a skill against evaluation cases. It is separate from Curator.

Primary commands:

```bash
session2skills evolve --store .session2skills/skills --skill code-review --dry-run
session2skills evolve --store .session2skills/skills --skill code-review --candidates 5 --apply-best
```

Evolution answers:

- Can this skill become more actionable?
- Are trigger conditions too vague?
- Are instructions too generic?
- Does a candidate perform better on historical task cases?
- Can the skill be shorter while preserving behavior?

Evolution flow:

```text
collect skill + traces + claims
  -> build eval cases
  -> score current skill
  -> reflect on failures
  -> generate candidate patches
  -> evaluate candidates
  -> select best valid candidate
  -> output report and optional apply
```

Suggested eval case:

```ts
type SkillEvalCase = {
  schemaVersion: "skill-eval-case/v1";
  id: string;
  userTask: string;
  repoContextSummary: string;
  expectedBehavior: Array<string>;
  forbiddenBehavior: Array<string>;
  relevantClaimIDs: Array<string>;
};
```

Suggested evaluation report:

```ts
type SkillEvaluation = {
  schemaVersion: "skill-evaluation/v1";
  skillID: string;
  evaluatedAt: string;
  gates: {
    lint: "pass" | "fail";
    redaction: "pass" | "fail";
    grounding: "pass" | "fail";
    semanticPreservation?: "pass" | "fail";
  };
  scores: {
    grounding: number;
    actionability: number;
    specificity: number;
    safety: number;
    concision: number;
    discoverability: number;
    duplication?: number;
  };
  verdict: "pass" | "needs-patch" | "reject";
  issues: Array<{
    severity: "low" | "medium" | "high";
    message: string;
    location?: string;
  }>;
};
```

Suggested candidate:

```ts
type EvolutionCandidate = {
  schemaVersion: "evolution-candidate/v1";
  candidateID: string;
  baseSkillID: string;
  patch: SkillPatch;
  rationale: string;
  expectedImprovement: string;
  evaluation?: SkillEvaluation;
};
```

Hard gates for candidate selection:

- Skill lint passes.
- Secret redaction passes.
- Grounding verifier passes.
- Semantic preservation passes.
- Size budget is respected.
- No high-risk instruction is introduced.
- Evaluation score improves over the baseline.

Full GEPA integration is deferred until this local loop matures. That future work is tracked in GitHub issue #6.

## Skill Quality Model

Skill quality should not be one LLM score. It should combine deterministic checks, grounding verification, and task-level evaluation.

### Deterministic Gates

Must pass:

- Valid YAML frontmatter.
- Non-empty `name` and `description`.
- Description is useful as a trigger hint.
- No obvious secret material.
- No `.env` payloads.
- No debug artifact language.
- Size stays within a configured budget.
- Strong directives are grounded in claim IDs or marked as fallback.

### Grounding Verification

The verifier checks whether skill directives are supported by the claim manifest.

Current harness verifier already does part of this. It should become a reusable evaluation component.

### Task-Level Evaluation

Task-level evaluation compares behavior with and without the skill over fixed eval cases.

Initial implementation can use LLM judging over planned responses instead of launching a full agent execution. Later, Layer 1 runtime traces can supply real usage outcomes.

## Development Workflow

The proposed workflow is:

```text
Codex plans and decomposes work
  -> Codex creates isolated worktrees
  -> OpenCode agents implement parallel tasks
  -> each worktree produces tests + summary
  -> Codex reviews branches
  -> Codex merges sequentially into an integration branch
  -> Codex runs full verification
```

This is feasible if the task graph is sliced by ownership boundaries and each worktree has a strict contract.

Good candidates for parallel work:

- `SkillIntent` schema and generation integration.
- Skill Store persistence and manifest writing.
- Evaluation types and deterministic gates.
- Curator dry-run inventory/report.
- Evolution eval-case and candidate report scaffolding.

Poor candidates for parallel work:

- Large edits to the same CLI command file.
- Shared schema churn without a fixed contract.
- Cross-cutting renames.
- Changes that all rewrite `normalize/models.ts` independently.

Required safety rules:

- Before every git operation, run `git rev-parse --show-toplevel` and verify it equals the expected repository root.
- Create worktrees only from the verified repository root.
- Use one branch per task with a clear prefix, such as `codex/skill-intent`, `codex/skill-store`, `codex/evaluate-command`.
- Avoid nested worktrees inside another repository.
- Run `git worktree list -v` before dispatch and before cleanup.
- Do not run build and e2e tests concurrently when tests read `dist/`.
- Merge branches one at a time into an integration branch.
- After each merge, run at least `npm run typecheck`.
- Before final merge, run `npm run build` and `npm test`.

Suggested branch flow:

```bash
git rev-parse --show-toplevel
git worktree add -b codex/skill-intent ../session2skills-skill-intent main
git worktree add -b codex/skill-store ../session2skills-skill-store main
git worktree add -b codex/evaluate-command ../session2skills-evaluate main
```

Codex should own:

- Task decomposition.
- Shared contracts.
- Worktree creation.
- Review and integration.
- Conflict resolution.
- Final verification.

OpenCode should own:

- Implementation inside its assigned worktree.
- Focused tests for that task.
- A short completion report naming changed files, tests run, and remaining risks.

The workflow is useful here because several components can be built in parallel, but only after the shared type contracts are written down. The first task should therefore be a small contract PR, not a wide implementation wave.

