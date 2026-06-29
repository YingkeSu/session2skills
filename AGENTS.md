# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-18
**Branch:** main

## OVERVIEW

CLI that reads developer work sessions from pluggable **adapters** (OpenCode SDK, OpenCode SQLite, Codex, Claude), normalizes them, extracts **evidence**, and runs a sequential four-stage LLM **harness pipeline** — **Analyst → Skeptic → Writer → Verifier** — that turns evidence into an evidence-grounded `SKILL.md` file. Every emitted **claim** cites **evidenceIDs**; the Skeptic critiques claims; the Writer renders only what the manifest allows; the Verifier rejects fabricated directives. TypeScript, ESM-only, strict mode.

For the full architecture map, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## STRUCTURE

```
src/
├── cli/            # Commander CLI entry + 4 sub-commands (inspect, evaluate, generate, serve)
├── adapters/       # Session source adapters (opencode/sdk, sqlite, codex, claude) + registry
├── evidence-store/ # SQLite-backed evidence persistence (audit copy)
├── generate/       # Skill rendering, lint, and evaluation
├── harness/        # 4-stage LLM pipeline (analyst → skeptic → writer → verifier)
├── llm/            # LLM abstraction (provider registry, OpenAI-compatible, retry, trace, prompts)
├── normalize/      # Session normalization + type models (the project's type backbone)
├── persist/        # Staged directory write (security: no traversal, no absolute paths)
├── server/         # Hono web server for serve command
├── sessions/       # Session loading and tree filtering
└── shared/         # Shared utilities: errors, cli, paths, redaction, run-summary
tests/
├── adapters/       # Adapter tests (codex/, claude/)
├── e2e/            # E2E tests (spawn real CLI, require build + .env + opencode on PATH)
├── evidence-store/ # EvidenceStore tests
├── fixtures/       # Typed test data factories
├── golden/         # Manual golden files (readFileSync + toBe, not vitest snapshots)
├── harness/        # Harness stage tests (analyst, skeptic, writer, verifier, packets, enrich-evidence, run-harness)
├── llm/            # LLM prompt tests
└── mock-provider.ts  # Scenario-based MockLlmProvider (success/timeout/malformed-json/network-error)
web/                # React + Vite Web UI frontend
docs/               # Design docs, architecture map, audit notes
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a CLI command | `src/cli/commands/` | Register in `src/cli/main.ts` |
| Modify the harness pipeline | `src/harness/` | 4 stages: `analyst.ts` → `skeptic.ts` → `writer.ts` → `verifier.ts`. Orchestrator: `run-harness.ts` |
| Change harness artifacts / types | `src/harness/types.ts` | `ClaimManifest`, `SkepticReport`, `WriterOutput`, `VerifierReport`, `HarnessResult` |
| Change LLM provider | `src/llm/` | Only module with barrel export (`index.ts`). Provider registry pattern |
| Add prompt templates | `src/llm/prompts/definitions.ts` | Has its own barrel. Uses `createPromptRegistry`. 4 templates: `harness-analyst/skeptic/writer/verifier` |
| Modify skill output / lint | `src/generate/` | `render-summary.ts` (summary.md), `skill-lint.ts` (lint), `evaluate-skill.ts` (evaluation) |
| Add a session source adapter | `src/adapters/<name>/` | Implement `SessionProvider` interface, register in `src/adapters/registry.ts` |
| Change session normalization | `src/normalize/` | `normalize-session.ts` (raw → NormalizedSession), `models.ts` (type backbone) |
| Change evidence extraction | `src/harness/evidence-index.ts` | `buildEvidenceIndex`, `selectEvidenceForBudget`, `makeEvidenceID` |
| Evidence persistence (SQLite) | `src/evidence-store/` | `store.ts` (EvidenceStore class), `persist.ts` (persistRawEvidence) |
| Fix error handling | `src/shared/errors.ts` | 3 custom error classes + `toErrorMessage` |
| Shared redaction | `src/shared/redaction.ts` | Secret redaction for all persisted content |
| Shared path utilities | `src/shared/paths.ts` | `resolveProjectDirectory`, `resolveGeneratedSkillsDirectory`, `getDefaultSkillStoreRoot` |
| Web UI backend | `src/server/app.ts` | Hono server, REST API, serves SPA |
| Web UI frontend | `web/` | React + Vite dashboard |
| Add test data | `tests/fixtures/` | Typed .ts fixture modules |
| Add golden file | `tests/golden/` | Manual comparison, not vitest snapshots |
| Architecture overview | `docs/ARCHITECTURE.md` | Cold-start map with data flow, layer breakdown, glossary |
| Codex/OpenCode workflow | `docs/codex-opencode-worktree-workflow.md` | SOP for Codex-led OpenCode worker development in Git worktrees |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `main` | function | `src/cli/main.ts` | CLI entry point, Commander program |
| `registerGenerateCommand` | function | `src/cli/commands/generate.ts` | `generate` sub-command (main pipeline) |
| `generateSkillRun` | function | `src/cli/commands/generate.ts` | Orchestrates session load → evidence → harness → persist |
| `registerEvaluateCommand` | function | `src/cli/commands/evaluate.ts` | `evaluate` sub-command |
| `registerInspectCommand` | function | `src/cli/commands/inspect.ts` | `inspect` sub-command |
| `registerServeCommand` | function | `src/cli/commands/serve.ts` | `serve` sub-command |
| `analyzeWithHarness` | function | `src/harness/run-harness.ts` | Harness orchestrator: analyst → skeptic → writer → verifier |
| `runAnalystStage` | function | `src/harness/analyst.ts` | Stage 1: evidence → ClaimManifest |
| `runSkepticStage` | function | `src/harness/skeptic.ts` | Stage 2: manifest → SkepticReport |
| `runWriterStage` | function | `src/harness/writer.ts` | Stage 3: manifest → WriterOutput (SKILL.md) |
| `runVerifierStage` | function | `src/harness/verifier.ts` | Stage 4: SKILL.md → VerifierReport |
| `ClaimManifest` | type | `src/harness/types.ts` | Stage 1 output: claims with dimension/label/confidence/evidenceRefs |
| `SkepticReport` | type | `src/harness/types.ts` | Stage 2 output: issues + overallScore |
| `WriterOutput` | type | `src/harness/types.ts` | Stage 3 output: skillMarkdown + sections |
| `VerifierReport` | type | `src/harness/types.ts` | Stage 4 output: pass/fail + checkedItems |
| `HarnessResult` | type | `src/harness/types.ts` | Top-level orchestrator result |
| `WorkflowSignalKind` | type | `src/normalize/models.ts` | 7-dimension taxonomy union |
| `NormalizedSession` | type | `src/normalize/models.ts` | Canonical in-memory session shape |
| `EvidenceItem` | type | `src/normalize/models.ts` | Redacted excerpt with evidenceID |
| `LLMTrace` | type | `src/normalize/models.ts` | Full LLM call record (schema `llm-trace/v1`) |
| `loadSessions` | function | `src/sessions/load-sessions.ts` | Adapter → list → filter → normalize |
| `normalizeSession` | function | `src/normalize/normalize-session.ts` | RawSession → NormalizedSession |
| `buildEvidenceIndex` | function | `src/harness/evidence-index.ts` | NormalizedSession[] → EvidenceItem[] |
| `createSessionProvider` | function | `src/adapters/registry.ts` | Adapter selection + factory |
| `evaluateSkill` | function | `src/generate/evaluate-skill.ts` | 3-gate skill evaluation |
| `writeGeneratedArtifacts` | function | `src/persist/generated-artifacts.ts` | Redact + lint + staged atomic write |
| `createServer` | function | `src/server/app.ts` | Hono web server factory |
| `CliUsageError` | class | `src/shared/errors.ts` | User-facing CLI errors |
| `OpenCodeAdapterError` | class | `src/shared/errors.ts` | Adapter failures |
| `LlmProviderError` | class | `src/shared/errors.ts` | LLM failures (retryable flag) |
| `LlmProviderRegistry` | class | `src/llm/registry.ts` | Provider registration/resolution |
| `OpenAiCompatibleProvider` | class | `src/llm/openai-compatible.ts` | OpenAI-compatible API adapter |
| `EvidenceStore` | class | `src/evidence-store/store.ts` | SQLite-backed evidence persistence |
| `MockLlmProvider` | class | `tests/mock-provider.ts` | Test mock with scenario queue |

## CONVENTIONS

- **ESM-only**: `"type": "module"` + `NodeNext` resolution. ALL imports MUST use `.js` extensions (e.g., `"./errors.js"`). TypeScript will fail without them.
- **`import type` enforced**: `verbatimModuleSyntax: true` means type-only imports MUST use `import type { X }`.
- **No barrel files** (except `src/llm/` and `src/llm/prompts/`). All other modules import directly by file path.
- **Custom error hierarchy**: Throw `CliUsageError` for user errors, `OpenCodeAdapterError` for adapter failures, `LlmProviderError` for LLM issues. Top-level catch in `main.ts` uses `toErrorMessage(error: unknown)`.
- **No linter/formatter** configured. No eslint, prettier, or biome.
- **Test naming**: `*.test.ts` only (no `.spec.ts`). Tests in `tests/` except co-located units.

## AGENT ORCHESTRATION WORKFLOW

Use this workflow when the user asks Codex to coordinate parallel implementation through OpenCode workers.

- **Codex is the orchestrator**: clarify requirements, define shared contracts, create task packets, create worktrees, review worker output, merge branches, and run final verification.
- **OpenCode is the worker**: implement only the assigned task inside one worktree, run focused verification, and return durable artifacts.
- **Do not rely on implicit chat state** between agents. Communication must flow through task packet files, Git diffs, completion/blocked reports, verification output, and optional `opencode run --format json` logs.
- **Read `docs/codex-opencode-worktree-workflow.md` before dispatching workers**. Follow its task packet, report, worktree, merge, and cleanup procedures.
- **Contract-first rule**: before launching parallel workers, stabilize shared types and schema contracts. Avoid parallel edits to the same shared files such as `src/normalize/models.ts` or `src/harness/types.ts` unless Codex has explicitly sequenced the work.
- **Git safety rule for worktrees**: before every git operation, run `git rev-parse --show-toplevel` and verify it equals `/Users/suyingke/Programs/OHO/session2skills`. Stop if it does not match.
- **Worktree placement**: create sibling worktrees under `/Users/suyingke/Programs/OHO/`, not inside this repository or another repository.
- **Branch naming**: use `codex/` branches for Codex-managed work, e.g. `codex/skill-store`, `codex/evaluate-command`.
- **Merge discipline**: OpenCode workers do not decide global completion. Codex reviews each branch, merges one branch at a time into an integration branch, runs verification after each merge, and only then declares the batch complete.
- **Verification discipline**: run at least `npm run typecheck` after each integration merge. Run `npm run build` and `npm run test:unit` before final handoff (`npm test` additionally runs `tests/e2e/`, which needs real opencode+LLM+`.env`). Do not run build/e2e flows concurrently when they read or rewrite `dist/`.

## AUTONOMOUS ISSUE LOOP

Convention for the `/loop`-style autonomous flow (check `gh issue list` → fix each issue in a worktree via a subagent → review → publish). Distinct from the Codex/OpenCode workflow above.

- **Publish through PRs, never a direct `main` push.** A subagent pushes a feature branch (`fix/issue-<n>-…`) and opens a PR with `gh pr create`. The orchestrator does **not** `git merge` locally then `git push origin main` — the Claude Code auto-mode guard denies direct pushes to `main`. Leave an issue OPEN while human-in-the-loop steps remain, and post a status comment.
- **Verify with `npm run test:unit`, not bare `npm test`.** `npm test` includes `tests/e2e/`, which hangs without real opencode + LLM + `.env` (timeouts 300s/600s) and on orphan `serve` processes holding `:3000`/`:3001`. `test:unit` excludes `tests/e2e/**` and `.claude/**` and runs the ~600-test unit suite in seconds.
- **Sibling worktrees only — do NOT use `isolation: "worktree"`.** Claude Code's worktree isolation nests under `.claude/worktrees/` *inside* this repo, and `vitest run` then scans those worktree test files (duplicate runs, slower). Create sibling worktrees under `/Users/suyingke/Programs/OHO/` (per the worktree-placement rule above) instead.
- **Concurrency**: enhancement/dev tasks at concurrency 2, bugs at 3. Do not run two subagents that edit the same shared files (`src/normalize/models.ts`, `src/harness/types.ts`, `web/`) in parallel.
- **Issue pool**: open issues are all `enhancement`/architecture/idea (no reproducible bugs). The actionable set is the `ready-for-agent` label.

## ANTI-PATTERNS (THIS PROJECT)

- **DO NOT** add barrel `index.ts` files to modules that don't already have one (only `src/llm/` and `src/llm/prompts/` have them)
- **DO NOT** use vitest `toMatchSnapshot` — golden files use manual `readFileSync` + `toBe` comparison
- **DO NOT** use `vi.mock()` broadly — use `MockLlmProvider` from `tests/mock-provider.ts` instead
- **DO NOT** add new npm dependencies without strong justification (project is intentionally lean: runtime deps are `commander`, `@opencode-ai/sdk`, `hono`, `@hono/node-server`, `better-sqlite3`)
- **DO NOT** run e2e tests without building first (`npm run build` required — preflight check verifies `dist/cli/main.js`)
- **DO NOT** commit `.session2skills/` or `generated-skills/` (gitignored runtime output)
- **DO NOT** use `any` type — `strict: true` enforced
- **DO NOT** let the Writer invent claims — the Writer must only render what's in the ClaimManifest; fabricated directives cause verifier `pass=false`
- **DO NOT** persist `rawOutput` in LLM traces by default — it is opt-in only (privacy)

## UNIQUE STYLES

- **Harness 4-stage pipeline**: sequential, stateful. Analyst (evidence → claims) → Skeptic (critique claims) → Writer (claims → SKILL.md) → Verifier (cross-check SKILL.md against manifest). Each stage consumes the previous stage's canonical artifact.
- **Evidence grounding invariant**: every directive in SKILL.md must trace to a `ManifestClaim`, which must cite ≥1 `evidenceID`. The Verifier enforces this; fabricated/unreferenced directives force `pass=false`.
- **Skeptic feedback application**: high-severity issues drop claims; medium-severity issues reduce confidence by 0.15 (floor 0.1); low-severity issues are noted but claims are kept. Implemented in `run-harness.ts` `applySkepticFeedback`.
- **Fixed 7-dimension taxonomy**: `work-style`, `communication-style`, `validation-habit`, `constraint`, `token-efficiency`, `model-selection`, `delegation-pattern`. Each dimension has canonical labels (e.g. `constraint` → `minimal-diff`, `preserve-patterns`, `type-safety`, `avoid-destructive-actions`). Defined in `src/normalize/models.ts` (`WorkflowSignalKind`) and `src/harness/packets.ts` (`HARNESS_TAXONOMY`).
- **Schema-versioned artifacts**: every persisted artifact carries a `schemaVersion` literal (`claim-manifest/v1`, `skeptic-report/v1`, `verifier-report/v1`, `evidence-item/v1`, `llm-trace/v1`, `skill-evaluation/v1`).
- **Staged directory write**: File output uses security constraints — no directory traversal (`..`), no absolute paths, atomic rename from staging directory.
- **Privacy by default**: Raw session evidence is sent to user-configured LLM endpoint. `rawOutput` in traces NOT persisted by default (opt-in only). All persisted content passes through `src/shared/redaction.ts`.
- **Pluggable adapters**: Session sources selected via `SESSION2SKILLS_ADAPTER` env (`sdk` default, `sqlite` auto-detected, `codex`, `claude`). Each adapter emits the shared `RawSession` shape.

## COMMANDS

```bash
npm run build          # tsc -p tsconfig.json
npm run build:web      # vite build --config web/vite.config.ts
npm run build:all      # build + build:web
npm run typecheck      # tsc --noEmit -p tsconfig.json
npm run typecheck:tests # tsc -p tsconfig.test.json
npm run dev            # tsx src/cli/main.ts (no build needed)
npm run start          # node dist/cli/main.js
npm test               # vitest run (ALL tests incl. e2e — slow; needs real opencode+LLM+.env)
npm run test:unit      # vitest run excluding tests/e2e/** + .claude/** (fast ~600-test gate; agent/CI verification)
npm run test:e2e       # vitest run tests/e2e/ (requires build + .env + opencode on PATH)
npm run test:e2e:web   # vitest run tests/e2e/serve.test.ts tests/e2e/web-flow.test.ts
npm run verify:web     # build:all + ensure-playwright-browser + test:e2e:web
```

## NOTES

- E2e tests are **serial** (`fileParallelism: false`) with 5-minute timeouts because they call real LLM APIs
- `src/shared/cli.ts` is NOT a CLI entry point — it contains argument parsers (`parsePositiveInteger`, `parseTonePreset`)
- Harness mode requires env vars: `SESSION2SKILLS_LLM_BASE_URL`, `SESSION2SKILLS_LLM_MODEL`, optionally `SESSION2SKILLS_LLM_API_KEY`
- `tests/e2e/helpers.ts` has `killOrphanedOpenCodeServers()` cleanup — e2e tests spawn real `opencode serve` processes
- `.sisyphus/` directory is agent planning state, not source code
- DeepSeek requires `preferJsonObject` flag (uses `{ type: "json_object" }` instead of `json_schema`)
- The default harness budget is `{ timeoutMs: 120_000, temperature: 0.3, maxOutputTokens: 8192 }` (defined in `src/harness/types.ts`)
- Each harness stage retries up to 2 times on LLM failure (`*_MAX_RETRIES = 2`)
- Web UI access: `http://localhost:<port>` and `http://100.98.177.122:<port>` (binds `0.0.0.0` by default)
