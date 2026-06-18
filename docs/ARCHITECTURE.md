# Architecture

> Cold-start map for new contributors. If you read only three files, read:
> [`src/harness/types.ts`](../src/harness/types.ts) (all artifacts),
> [`src/harness/run-harness.ts`](../src/harness/run-harness.ts) (orchestration),
> [`src/normalize/models.ts`](../src/normalize/models.ts) (type backbone).

---

## One-paragraph orientation

**session2skills** is a TypeScript ESM CLI that reads developer work sessions from pluggable **adapters** (OpenCode SDK / SQLite / Codex / Claude), **normalizes** them into a canonical session shape, extracts **evidence** items (redacted excerpts), then runs a sequential four-stage LLM **harness pipeline** — **Analyst → Skeptic → Writer → Verifier** — that turns evidence into an evidence-grounded `SKILL.md`. Every emitted **claim** cites **evidenceIDs**; the **Skeptic** critiques the claims; the **Writer** renders only what the manifest allows; the **Verifier** rejects any **fabricated directive**. A Web UI (`serve` command) exposes the same pipeline over HTTP.

---

## Big-picture data flow

```
                        ┌─────────────────────────────────────┐
                        │      src/adapters/ (4 sources)       │
                        │  sdk · sqlite · codex · claude       │
                        └───────────────┬─────────────────────┘
                                        │ RawSession + RawSessionMessages + RawSessionDiff
                                        ▼
                        ┌─────────────────────────────────────┐
                        │   src/sessions/  +  src/normalize/   │
                        │   load-sessions → normalizeSession   │
                        └───────────────┬─────────────────────┘
                                        │ NormalizedSession[]
                                        ▼
                        ┌─────────────────────────────────────┐
                        │   src/harness/evidence-index.ts      │
                        │   flatten → redact → EvidenceItem[]   │
                        └──────┬──────────────────┬───────────┘
                               │                  │
                               ▼                  ▼
            ┌──────────────────────────┐   ┌──────────────────────┐
            │  src/evidence-store/     │   │  src/harness/        │
            │  SQLite audit copy       │   │  4-stage LLM harness │
            │  (EvidenceStore)         │   │  Analyst→Skeptic→    │
            └──────────────────────────┘   │  Writer→Verifier     │
                                           └──────────┬───────────┘
                                                      │ HarnessResult
                                                      ▼
                               ┌──────────────────────────────────┐
                               │ src/harness/enrich-evidence.ts   │
                               │ src/generate/render-summary.ts   │
                               │ src/generate/skill-lint.ts       │
                               └──────────────┬───────────────────┘
                                              ▼
                               ┌──────────────────────────────────┐
                               │ src/persist/  (staged atomic write)│
                               │ → SKILL.md, summary.md,           │
                               │   claim-manifest.json,            │
                               │   skeptic-report.json,            │
                               │   verifier-report.json,           │
                               │   llm-traces.json                 │
                               └──────────────────────────────────┘
```

The **Web UI** (`src/server/app.ts` + `web/`) is a dashboard over those output directories, plus `POST /api/runs` that invokes the same pipeline.

---

## Layer map

### 1. Entry — [`src/cli/main.ts`](../src/cli/main.ts)

Registers **4 commands**: `inspect`, `evaluate`, `generate`, `serve`. Top-level `catch` renders `CliUsageError` cleanly; everything else as `Error: <message>` via `toErrorMessage`.

### 2. Adapters — [`src/adapters/`](../src/adapters/)

Pluggable **session sources** selected by `SESSION2SKILLS_ADAPTER` env (`sdk` default, `sqlite` auto-detected, `codex`, `claude`). `createSessionProvider()` ([`registry.ts`](../src/adapters/registry.ts)) returns a `ProviderHandle` exposing `listRecentSessions`, `getSession`, `getSessionMessages`, `getSessionDiff`. Each adapter family emits the shared `RawSession` / `RawSessionMessages` / `RawSessionDiff` shapes defined in [`src/normalize/raw-session.ts`](../src/normalize/raw-session.ts).

### 3. Normalization — [`src/normalize/`](../src/normalize/)

- [`raw-session.ts`](../src/normalize/raw-session.ts) — leaf types for adapter output.
- [`normalize-session.ts`](../src/normalize/normalize-session.ts) — `normalizeSession()` transforms raw → **`NormalizedSession`**. Flattens polymorphic parts into typed `NormalizedMessage` / `NormalizedPart` / `ToolInvocation`, pairs `step-start`/`step-finish` into `NormalizedStep`, aggregates diffs, caps tool output at 10 000 chars, attaches an `EvidenceRef` (600-char excerpt) to every addressable element.
- [`models.ts`](../src/normalize/models.ts) — the project's type backbone. Defines `WorkflowSignalKind` (the 7-dimension **taxonomy**), `EvidenceItem`/`EvidenceRef`/`EvidenceCitation`, `LLMTrace` + `LLMTraceStage`, `SkillEvaluation` + gates/verdict, and all schema-version literals.

### 4. Session loading — [`src/sessions/`](../src/sessions/)

[`loadSessions()`](../src/sessions/load-sessions.ts) orchestrates: adapter → list → `filterSessions()` (drops subagent sessions via [`session-tree.ts`](../src/sessions/session-tree.ts)) → per-session fetch → `normalizeSession`. Returns `{ normalizedSessions, warnings, skippedSessions }`.

### 5. Evidence layer — [`src/harness/evidence-index.ts`](../src/harness/evidence-index.ts) + [`src/evidence-store/`](../src/evidence-store/)

- `buildEvidenceIndex(sessions)` flattens every message/part/tool into an `EvidenceItem[]`, each with a deterministic **evidenceID** (`sessionID:messageID:partID`) and a redacted `summaryText`. This is the in-memory corpus the harness reads.
- `selectEvidenceForBudget(items, tokenBudget)` picks a subset for the LLM prompt, preferring direct-user evidence.
- [`EvidenceStore`](../src/evidence-store/store.ts) (backed by `better-sqlite3`) is the **audit copy**: `persistRawEvidence()` upserts each record. Not consulted by the harness at runtime.

### 6. Harness pipeline — [`src/harness/`](../src/harness/) (the heart)

Sequential, stateful. Each stage consumes the previous stage's canonical artifact.

| # | Stage | File | Reads | Produces | Schema |
|---|-------|------|-------|----------|--------|
| 1 | **Analyst** | [`analyst.ts`](../src/harness/analyst.ts) | `NormalizedSession[]`, `EvidenceItem[]` | **`ClaimManifest`** (claims with dimension/label/confidence/rationale/evidenceRefs) | `claim-manifest/v1` |
| 2 | **Skeptic** | [`skeptic.ts`](../src/harness/skeptic.ts) | `ClaimManifest`, `EvidenceItem[]` | **`SkepticReport`** (issues: unsupported/contradicted/overconfident/vague/duplicate; overallScore 0–1) | `skeptic-report/v1` |
| — | *feedback* | `run-harness.ts` `applySkepticFeedback` | SkepticReport issues | **revised ClaimManifest** (high→dropped, medium→confidence −0.15, low→kept) | — |
| 3 | **Writer** | [`writer.ts`](../src/harness/writer.ts) | revised `ClaimManifest`, `tone`, optional evidence | **`WriterOutput`** (`skillMarkdown` + structured `sections[]` of `WriterDirective`s, each with `sourceClaimId`) | — |
| 4 | **Verifier** | [`verifier.ts`](../src/harness/verifier.ts) | `skillMarkdown`, revised `ClaimManifest` | **`VerifierReport`** (`pass`, per-directive `checkedItems` with status `verified`/`unreferenced`/`fabricated`, issues) | `verifier-report/v1` |

**Supporting harness modules:**

- [`packets.ts`](../src/harness/packets.ts) — `buildAnalystPacket` / `buildSkepticPacket` / `buildWriterPacket` / `buildVerifierPacket`. Constructs the `HarnessPacket` (`messages` + Zod `schema` + `promptId`/`promptVersion`). Owns `HARNESS_TAXONOMY` (7 dimensions + canonical labels per dimension).
- [`stage-runner.ts`](../src/harness/stage-runner.ts) — `resolveHarnessBudget()` merges caller partial over `DEFAULT_HARNESS_BUDGET` (`timeoutMs: 120_000`, `temperature: 0.3`, `maxOutputTokens: 8192`).
- [`enrich-evidence.ts`](../src/harness/enrich-evidence.ts) — post-harness: embeds verbatim `ManifestEvidenceExcerpt[]` into the manifest so the output directory is self-contained for auditing.
- [`types.ts`](../src/harness/types.ts) — all canonical artifacts + `HarnessResult` + schema-version consts.

Each stage wraps its LLM call in up to 2 retries (`*_MAX_RETRIES = 2`) and emits an `LLMTrace` accumulated into `HarnessResult.traces`.

### 7. LLM abstraction — [`src/llm/`](../src/llm/) (the ONLY barrel-exported module)

- [`registry.ts`](../src/llm/registry.ts) → `LlmProviderRegistry` — `register()` + `resolve(providerId, model?)` returning `ResolvedLlmProvider`. Auto-infers model when only one registered.
- [`openai-compatible.ts`](../src/llm/openai-compatible.ts) → `OpenAiCompatibleProvider` — sends `POST /chat/completions`; supports `generateText` and `generateStructured<T>` (Zod-validated). `preferJsonObject` flag for DeepSeek/ZhipuAI. Maps HTTP 408/429/5xx → retryable `LlmProviderError`.
- [`retry.ts`](../src/llm/retry.ts) → `runWithRetry` — exponential backoff, respects `Retry-After`, retries only when `LlmProviderError.retryable`.
- [`trace.ts`](../src/llm/trace.ts) → `createTrace`, `applyTracePolicy`, `sanitizePersistedTraces`. **Privacy default: `rawOutput` NOT persisted unless opt-in**; request content redacted via [`shared/redaction.ts`](../src/shared/redaction.ts).
- [`prompts/`](../src/llm/prompts/) — `createPromptRegistry()` (semver-versioned templates) + 4 definitions: `harness-analyst`, `harness-skeptic`, `harness-writer`, `harness-verifier` (all v1.0.0), each embedding the 7-dimension taxonomy enum + canonical labels.

### 8. Output rendering & persistence

- [`src/generate/render-summary.ts`](../src/generate/render-summary.ts) → `renderSummary()` produces human-readable `summary.md`.
- [`src/generate/skill-lint.ts`](../src/generate/skill-lint.ts) → `lintSkillMarkdown()` / `assertValidSkillMarkdown()` — enforces frontmatter, bans debug/report prose, secret material, env payloads.
- [`src/generate/evaluate-skill.ts`](../src/generate/evaluate-skill.ts) → `evaluateSkill()` — 3 gates (`lint`, `redaction`, `grounding`), 7 scores, verdict (`pass`/`needs-patch`/`reject`). Used by both `evaluate` command and `POST /api/runs/:name/evaluate`.
- [`src/persist/generated-artifacts.ts`](../src/persist/generated-artifacts.ts) → `writeGeneratedArtifacts()` — orchestrates redaction + lint + trace sanitization, then delegates the atomic write.
- [`src/persist/staged-directory-write.ts`](../src/persist/staged-directory-write.ts) → `writeDirectoryArtifacts()` — **security boundary**: rejects `..` and absolute paths, writes to `.${base}.staging-*` then renames. Handles `--force` by backing up existing dir.

### 9. Web UI — [`src/server/app.ts`](../src/server/app.ts) + [`web/`](../web/)

Hono server. `createServer(runsDirectory)` exposes:

- `GET /api/runs` (list), `GET /api/runs/:name` (detail), `GET /api/runs/:name/evidence/:id`
- `POST /api/runs` → invokes `generateSkillRun` (same pipeline as CLI `generate`)
- `POST /api/runs/:name/evaluate` → invokes `evaluateSkill`
- Optional Bearer auth via `SESSION2SKILLS_API_TOKEN`
- Serves `web/dist/` as SPA (React + Vite dashboard)

### 10. Shared utilities — [`src/shared/`](../src/shared/)

- [`errors.ts`](../src/shared/errors.ts) — `CliUsageError`, `OpenCodeAdapterError`, `LlmProviderError` (with `retryable`/`retryAfterMs`), `toErrorMessage`.
- [`cli.ts`](../src/shared/cli.ts) — `parsePositiveInteger`, `parseTonePreset` (`concise`/`balanced`/`detailed`).
- [`paths.ts`](../src/shared/paths.ts) — `resolveProjectDirectory`, `resolveGeneratedSkillsDirectory`, `getDefaultSkillStoreRoot` (`<root>/.session2skills/skills`).
- [`redaction.ts`](../src/shared/redaction.ts) — redacts PEM keys, `sk-*`, `gh[pousr]_*`, sensitive env/JSON keys. Allow-list: `token-efficiency`, `csrf-token`, `total-tokens`, etc.
- [`run-summary.ts`](../src/shared/run-summary.ts) — `RunSummary` type for the dashboard.

---

## Canonical pipeline (one `generate` invocation)

```
generateSkillRun(input)
  │
  ├─ loadSessions ───────────────────► NormalizedSession[]
  ├─ buildEvidenceIndex ─────────────► EvidenceItem[] (in-memory, redacted)
  ├─ EvidenceStore + persistRawEvidence ──► SQLite audit copy
  │
  ├─ resolveHybridLlmProvider ───────► ResolvedLlmProvider (OpenAI-compatible)
  ├─ buildPromptRegistry ────────────► PromptRegistry (4 harness templates)
  │
  ├─ analyzeWithHarness
  │    ├─ Analyst  ───► ClaimManifest
  │    ├─ Skeptic  ───► SkepticReport
  │    ├─ applySkepticFeedback ──► revised ClaimManifest
  │    ├─ Writer   ───► WriterOutput (skillMarkdown + sections)
  │    └─ Verifier ───► VerifierReport (pass/fail per directive)
  │
  ├─ enrichManifestWithEvidence ─────► self-contained ClaimManifest
  ├─ renderSummary ──────────────────► summary.md
  └─ writeGeneratedArtifacts ────────► atomic staged write
       └─ assertValidSkillMarkdown, redactSecretsFromString,
          sanitizePersistedTraces, writeDirectoryArtifacts
```

---

## Key invariants

1. **Evidence grounding** — every directive in `SKILL.md` must trace to a `ManifestClaim`, which must cite ≥1 `evidenceID`. The Verifier enforces this; fabricated/unreferenced directives force `pass=false`.
2. **Writer cannot invent** — the Writer prompt restricts output to claims in the manifest; `buildFallbackMarkdown` synthesizes from claims if the LLM output is malformed.
3. **Skeptic mutates the manifest** — high-severity claims are dropped, medium-severity lose 0.15 confidence (floor 0.1), low-severity are kept.
4. **Fixed 7-dimension taxonomy** — `work-style`, `communication-style`, `validation-habit`, `constraint`, `token-efficiency`, `model-selection`, `delegation-pattern`. Each dimension has canonical labels (e.g. `constraint` → `minimal-diff`, `preserve-patterns`, `type-safety`, `avoid-destructive-actions`).
5. **Privacy default** — `rawOutput` in `llm-traces.json` is opt-in only; all persisted content passes through `shared/redaction.ts`.
6. **Staged-write security** — no `..`, no absolute paths, atomic rename from staging dir.
7. **ESM-only with `.js` import extensions**; `import type` enforced; `strict: true`; no `any`. The **only** barrel exports are `src/llm/index.ts` and `src/llm/prompts/index.ts`.

---

## Domain glossary

| Term | Meaning | Defined in |
|------|---------|------------|
| **Adapter** | Pluggable session source: `sdk`, `sqlite`, `codex`, `claude`. | [`src/adapters/registry.ts`](../src/adapters/registry.ts) |
| **Evidence** | A redacted excerpt from a session message/part/tool, identified by an `evidenceID`. Every claim must cite evidence IDs. | [`src/normalize/models.ts`](../src/normalize/models.ts) |
| **evidenceID** | Deterministic `sessionID:messageID:partID` string uniquely identifying an evidence item. | [`src/harness/evidence-index.ts`](../src/harness/evidence-index.ts) |
| **Claim** | A structured assertion about developer behavior: dimension, label, confidence (0–1), rationale, evidenceRefs. The fundamental unit of analysis. | `ManifestClaim` in [`src/harness/types.ts`](../src/harness/types.ts) |
| **ClaimManifest** | Stage 1 (Analyst) output. Contains claims, evidenceSummary, dimensionsCovered, metadata. Schema `claim-manifest/v1`. | [`src/harness/types.ts`](../src/harness/types.ts) |
| **Skeptic** | Stage 2. Reviews the ClaimManifest, flags unsupported/contradicted/overconfident/vague/duplicate claims. Outputs `SkepticReport`. | [`src/harness/skeptic.ts`](../src/harness/skeptic.ts) |
| **SkepticReport** | Stage 2 output. Issues array (claimId, severity, problemType, detail, suggestion) + overallScore (0–1). Schema `skeptic-report/v1`. | [`src/harness/types.ts`](../src/harness/types.ts) |
| **Writer** | Stage 3. Renders the ClaimManifest into SKILL.md prose + structured sections. Cannot add information not in the manifest. | [`src/harness/writer.ts`](../src/harness/writer.ts) |
| **WriterOutput** | Stage 3 output. Contains `skillMarkdown` + `sections[]` (each with title, summary, directives, groundingClaimIds). | [`src/harness/types.ts`](../src/harness/types.ts) |
| **Directive** | An actionable instruction: `{text, sourceClaimId}`. Links a directive text back to a ManifestClaim. | `WriterDirective` in [`src/harness/types.ts`](../src/harness/types.ts) |
| **Verifier** | Stage 4. Cross-checks every directive in SKILL.md against the ClaimManifest. Flags fabricated or unreferenced directives. | [`src/harness/verifier.ts`](../src/harness/verifier.ts) |
| **VerifierReport** | Stage 4 output. `pass` boolean, per-directive `checkedItems`, issues. Schema `verifier-report/v1`. | [`src/harness/types.ts`](../src/harness/types.ts) |
| **Fabricated directive** | A directive in SKILL.md that the Verifier cannot map to any manifest claim. Causes `pass=false`. | [`src/harness/verifier.ts`](../src/harness/verifier.ts) |
| **HarnessResult** | Top-level orchestrator output: manifest, skepticReport, writerOutput, verifierReport, traces, revisedManifest. | [`src/harness/types.ts`](../src/harness/types.ts) |
| **HarnessPacket** | Input to each LLM stage: `{messages, schema, promptId, promptVersion}`. | [`src/harness/packets.ts`](../src/harness/packets.ts) |
| **WorkflowSignalKind** | The 7 taxonomy dimensions (see invariant 4 above). | [`src/normalize/models.ts`](../src/normalize/models.ts) |
| **Taxonomy** | The 7-dimension classification system with canonical labels per dimension. | `HARNESS_TAXONOMY` in [`src/harness/packets.ts`](../src/harness/packets.ts) |
| **NormalizedSession** | Canonical in-memory session representation after adapter normalization. | [`src/normalize/models.ts`](../src/normalize/models.ts) |
| **EvidenceStore** | SQLite-backed audit persistence for evidence records (rawText + excerpt). | [`src/evidence-store/store.ts`](../src/evidence-store/store.ts) |
| **SKILL.md** | The final generated artifact: installable-style skill with YAML frontmatter (`name`, `description`) and agent-facing imperative instructions. | [`src/harness/writer.ts`](../src/harness/writer.ts) |
| **Tone preset** | Output verbosity control: `concise`, `balanced` (default), `detailed`. | [`src/shared/cli.ts`](../src/shared/cli.ts) |
| **Run** | A single `generate` execution producing a directory under `generated-skills/<run-name>/`. | [`src/shared/paths.ts`](../src/shared/paths.ts) |
| **SkillEvaluation** | Post-generation quality gate: 3 gates (lint, redaction, grounding), 7 scores, verdict. Schema `skill-evaluation/v1`. | [`src/normalize/models.ts`](../src/normalize/models.ts), [`src/generate/evaluate-skill.ts`](../src/generate/evaluate-skill.ts) |
| **LLMTrace** | Full record of an LLM call: stage, provider, model, request messages, response, usage, warnings. Schema `llm-trace/v1`. | [`src/normalize/models.ts`](../src/normalize/models.ts) |
| **PromptRegistry** | Registry for semver-versioned prompt templates. Stages resolve prompts by ID. | [`src/llm/prompts/registry.ts`](../src/llm/prompts/registry.ts) |

---

## Cross-module call graph

```
main.ts
  ├─ registerInspectCommand → inspect.ts → createSessionProvider → adapter.listRecentSessions
  ├─ registerEvaluateCommand → evaluate.ts → evaluateSkill → lintSkillMarkdown, containsSecretMaterial
  ├─ registerGenerateCommand → generate.ts
  │     ├─ loadSessions → createSessionProvider → adapter + normalizeSession
  │     ├─ buildEvidenceIndex → evidence-index.ts
  │     ├─ EvidenceStore + persistRawEvidence → store.ts (SQLite)
  │     ├─ analyzeWithHarness → run-harness.ts
  │     │     ├─ runAnalystStage → packets.ts (buildAnalystPacket) → provider.generateStructured
  │     │     ├─ runSkepticStage → packets.ts (buildSkepticPacket) → provider.generateStructured
  │     │     ├─ applySkepticFeedback (local)
  │     │     ├─ runWriterStage → packets.ts (buildWriterPacket) → provider.generateStructured
  │     │     └─ runVerifierStage → packets.ts (buildVerifierPacket) → provider.generateStructured
  │     ├─ enrichManifestWithEvidence → enrich-evidence.ts
  │     ├─ renderSummary → render-summary.ts
  │     └─ writeGeneratedArtifacts → generated-artifacts.ts
  │           ├─ assertValidSkillMarkdown → skill-lint.ts
  │           └─ writeDirectoryArtifacts → staged-directory-write.ts
  └─ registerServeCommand → serve.ts → createServer (server/app.ts)
        ├─ generateSkillRun (same as generate.ts pipeline)
        ├─ evaluateSkill
        └─ scanRuns (reads artifact files)
```
