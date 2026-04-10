# OpenCode-First MVP Plan: session2skills

## 1. Product definition

### One-sentence goal
Build a standalone CLI tool that analyzes local OpenCode sessions and generates a personalized workflow skill file that reflects how the user actually likes to work.

### Core user value
- Save users from hand-writing their own workflow skill
- Turn repeated behavior in real sessions into reusable instructions
- Produce an editable artifact instead of a black-box profile

### MVP success criteria
The user can run one command against recent OpenCode sessions, review a generated summary of extracted habits, and save a usable first-draft skill file locally.

## 2. Scope

### In scope for MVP
- OpenCode only
- Historical session analysis only
- CLI-only UX
- Read session data from supported OpenCode interfaces
- Normalize session data into internal models
- Extract a small set of workflow signals
- Generate:
  - a human-readable summary
  - a single personalized skill file
- Write outputs to local disk

### Explicitly out of scope
- Claude Code / Codex / Cursor ingestion
- Realtime monitoring or auto-updating
- UI or web dashboard
- Multi-profile persona management
- Automatic installation into every target environment
- Complex ranking, embeddings, or long-term memory systems
- Remote sync or team sharing

## 3. MVP outcome

### User input
- Which project/workspace to inspect
- How many recent sessions to analyze
- Optional output location
- Optional tone preset for generated skill (`concise`, `balanced`, `detailed`)

### User output
1. `summary.md`
   - what habits were detected
   - confidence notes / evidence summary
   - what the generated skill will emphasize
2. `SKILL.md`
   - scenario / purpose
   - user's preferred workflow
   - preferred communication style
   - preferred validation steps
   - constraints / anti-patterns to avoid

## 4. Key product decisions

### Tool shape
This should be a standalone CLI tool, not just a skill.

Reasoning:
- ingestion and analysis are data-processing tasks
- the tool will need caching, repeatability, and local state
- skills are the output artifact, not the right runtime container for the pipeline

### Data access strategy
Prefer supported OpenCode interfaces over private storage internals.

Priority order:
1. OpenCode SDK/API session access
2. OpenCode export/CLI-mediated access
3. Direct storage parsing only as fallback

### Output strategy
Generate editable markdown artifacts first. Avoid writing directly into live runtime config unless the user explicitly asks.

## 5. User workflow

### Happy path
1. User runs `session2skills inspect`
2. Tool lists recent OpenCode sessions with basic metadata
3. User runs `session2skills generate --recent 20`
4. Tool loads sessions and extracts workflow signals
5. Tool shows a concise preview summary
6. Tool writes `summary.md` and `SKILL.md`

### MVP UX principle
Review before apply. The first version should generate artifacts for inspection, not silently mutate the OpenCode environment.

## 6. Functional requirements

### 6.1 Session inspection
Must have:
- list recent sessions
- show session id, project/workspace, title if available, updated time
- support limiting to recent N sessions

### 6.2 Session loading
Must have:
- load session messages
- load session summary if available
- load session diff if available
- capture tool usage signals when present

### 6.3 Normalization
Must have internal models for:
- `NormalizedSession`
- `NormalizedMessage`
- `NormalizedPart`
- `ToolInvocation`
- `WorkflowSignal`
- `PreferenceProfile`
- `EvidenceRef`

### 6.4 Signal extraction
MVP should only infer these four buckets:

1. Work style
   - analysis-first vs implementation-first
   - iterative vs one-shot

2. Communication style
   - concise vs explanatory
   - directive vs consultative

3. Validation habits
   - whether the user/agent tends to run tests, diagnostics, diff checks, status checks

4. Constraints and preferences
   - minimal diff
   - preserve existing patterns
   - type safety emphasis
   - avoid risky/destructive actions

### 6.5 Artifact generation
Must generate:
- human summary with evidence notes
- personalized skill markdown

Should include in generated skill:
- purpose
- when to use
- preferred work sequence
- expected communication style
- validation checklist
- hard constraints / things to avoid

### 6.6 Output persistence
Must have:
- configurable output directory
- deterministic file naming
- overwrite confirmation or explicit `--force`

## 7. Non-functional requirements

- Local-first: no external upload required for MVP
- Deterministic generation inputs where possible
- Traceable conclusions: every major preference should be backed by evidence counts or examples
- Failure-safe output: failed analysis should not partially overwrite final artifacts
- Extensible adapter boundary for future Claude/Codex support

## 8. Proposed architecture

## 8.1 Layered architecture

```text
CLI
  -> Application Service
    -> OpenCode Adapter
    -> Normalizer
    -> Signal Extractor
    -> Profile Builder
    -> Artifact Generator
    -> File Writer
```

### 8.2 Module responsibilities

#### `src/cli/`
- parse flags and subcommands
- render tables / progress / preview
- ask for confirmation when writing outputs

#### `src/adapters/opencode/`
- talk to OpenCode SDK or supported local interfaces
- list sessions
- fetch messages / summaries / diffs
- translate raw OpenCode responses into raw domain inputs

#### `src/normalize/`
- convert OpenCode-specific shapes into stable internal models
- strip irrelevant noise
- preserve provenance references

#### `src/analyze/`
- extract low-level signals from normalized sessions
- aggregate repeated patterns
- score confidence heuristically

#### `src/profile/`
- combine signals into a `PreferenceProfile`
- deduplicate overlapping rules
- rank what belongs in the skill vs summary only

#### `src/generate/`
- render `summary.md`
- render `SKILL.md`
- map profile fields to prompt/skill sections

#### `src/persist/`
- manage output directories
- write files atomically
- store optional cache/run metadata

## 8.3 Suggested project structure

```text
src/
  cli/
    main.ts
    commands/
      inspect.ts
      analyze.ts
      generate.ts
  adapters/
    opencode/
      client.ts
      sessions.ts
      messages.ts
      diffs.ts
  normalize/
    models.ts
    normalize-session.ts
  analyze/
    signal-types.ts
    extract-work-style.ts
    extract-communication-style.ts
    extract-validation-habits.ts
    extract-constraints.ts
  profile/
    build-profile.ts
    score-confidence.ts
  generate/
    render-summary.ts
    render-skill.ts
  persist/
    write-artifacts.ts
    run-store.ts
  shared/
    errors.ts
    paths.ts
    types.ts
```

## 9. Internal data model

### `NormalizedSession`
- `id`
- `projectPath`
- `title`
- `updatedAt`
- `messages: NormalizedMessage[]`
- `summary?`
- `diffSummary?`
- `toolInvocations: ToolInvocation[]`

### `NormalizedMessage`
- `id`
- `role`
- `timestamp`
- `text`
- `parts`

### `ToolInvocation`
- `toolName`
- `timestamp`
- `success`
- `metadata`

### `WorkflowSignal`
- `kind`
- `value`
- `weight`
- `evidence: EvidenceRef[]`

### `PreferenceProfile`
- `workStyle`
- `communicationStyle`
- `validationHabits`
- `constraints`
- `confidenceNotes`

### `EvidenceRef`
- `sessionID`
- `messageID?`
- `sourceType` (`message`, `tool`, `summary`, `diff`)
- `excerpt?`

## 10. CLI surface

### `session2skills inspect`
Purpose: show what sessions are available for analysis.

Example:
```bash
session2skills inspect --recent 20
```

### `session2skills analyze`
Purpose: compute normalized data and extracted profile without writing final skill.

Example:
```bash
session2skills analyze --recent 20 --out .session2skills/runs/latest
```

Outputs:
- normalized run data
- extracted profile JSON
- preview summary

### `session2skills generate`
Purpose: generate final markdown artifacts from either live analysis or saved profile.

Example:
```bash
session2skills generate --recent 20 --output ./generated-skills/my-workflow
```

Optional later:
- `session2skills apply`
- `session2skills diff`

## 11. Execution flow

### End-to-end flow
1. Discover target sessions
2. Fetch OpenCode session artifacts
3. Normalize to internal models
4. Extract low-level signals
5. Aggregate into a `PreferenceProfile`
6. Render summary and skill markdown
7. Preview results
8. Write files to output directory

## 12. Milestones

### Milestone 1: session access
- working OpenCode adapter
- inspect command
- read recent sessions and messages

#### QA scenario
- Command: `session2skills inspect --recent 5`
- Setup: run inside a machine that already has at least 5 OpenCode sessions for the current workspace or a specified workspace flag.
- Expected result:
  - command exits with code 0
  - terminal shows up to 5 sessions with session id and updated time
  - selecting one returned session id through the adapter can fetch message content without throwing

### Milestone 2: normalization and heuristics
- internal normalized models
- first-pass signal extraction for 4 buckets
- profile JSON output

#### QA scenario
- Command: `session2skills analyze --recent 5 --out .session2skills/runs/test-run`
- Setup: use the same 5-session dataset validated in Milestone 1.
- Expected result:
  - command exits with code 0
  - `.session2skills/runs/test-run/profile.json` is created
  - profile contains non-empty sections for at least one of the four signal buckets
  - rerunning the same command on the same input produces the same top-level profile fields and stable ordering for the highest-confidence rules

### Milestone 3: artifact generation
- summary renderer
- skill renderer
- output writer and preview flow

#### QA scenario
- Command: `session2skills generate --recent 5 --output ./generated-skills/test-skill`
- Setup: either analyze live sessions during the command or reuse the saved profile from Milestone 2.
- Expected result:
  - command exits with code 0
  - `./generated-skills/test-skill/summary.md` exists
  - `./generated-skills/test-skill/SKILL.md` exists
  - `summary.md` explains detected habits in plain language
  - `SKILL.md` includes workflow, communication style, validation guidance, and constraints
  - preview text shown before write matches the written files closely enough for a human reviewer to trust the flow

### Milestone 4: polish for MVP release
- error handling
- overwrite protections
- sample fixtures / golden outputs
- basic docs

#### QA scenario
- Commands:
  - `session2skills generate --recent 5 --output ./generated-skills/test-skill`
  - rerun the same command without `--force`
  - rerun with `--force`
- Setup: fixture sessions committed for tests plus one manual run against a real OpenCode workspace.
- Expected result:
  - fixture/golden tests pass in CI
  - second run without `--force` refuses destructive overwrite and exits non-zero or prompts clearly
  - run with `--force` succeeds and rewrites files atomically
  - README or usage doc is sufficient for a new developer to reproduce `inspect`, `analyze`, and `generate`

## 13. Validation strategy

### Must validate during development
- session listing works against real OpenCode data
- at least 3-5 real sessions can be normalized without crashing
- extracted profile remains stable across repeated runs on same input
- generated markdown is readable and editable
- output writing is atomic and non-destructive

### Suggested test mix
- unit tests for signal extraction heuristics
- fixture tests for normalization
- golden tests for markdown rendering
- one manual end-to-end run on a real OpenCode workspace

## 14. Risks and mitigations

### Risk: OpenCode data interfaces evolve
Mitigation:
- isolate OpenCode access behind one adapter
- prefer SDK/export interfaces over storage internals

### Risk: generated preferences feel generic or wrong
Mitigation:
- keep inference buckets narrow
- include evidence references
- make outputs explicitly editable

### Risk: too much noise from weak sessions
Mitigation:
- filter out short or low-signal sessions
- weight repeated patterns over one-off behavior

### Risk: scope creep into multi-tool platform work
Mitigation:
- enforce OpenCode-only adapter boundary for MVP
- keep cross-tool abstractions internal, not public-facing

## 15. Post-MVP expansion path

After MVP succeeds:
1. add Claude Code adapter
2. add Codex adapter
3. compare per-project vs global profiles
4. support direct install/apply flows
5. support profile evolution over time

## 16. Build recommendation

Recommended stack:
- TypeScript
- Node.js runtime
- existing OpenCode SDK where possible
- markdown-first artifact generation

Rationale:
- aligns with the existing `.opencode` dependency footprint
- easiest path for SDK integration
- good fit for CLI + file generation

## 17. Final MVP definition

The MVP is complete when a user can point the CLI at recent OpenCode sessions and receive a locally saved summary plus a first-draft personalized `SKILL.md` that meaningfully reflects repeated working habits.
