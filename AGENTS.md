# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-22
**Commit:** 54301df
**Branch:** main

## OVERVIEW

CLI that reads local OpenCode sessions, analyzes work patterns, and generates a `SKILL.md` file for AI assistants. Two modes: legacy (local heuristics) and hybrid (LLM-enhanced). TypeScript, ESM-only, strict mode.

## STRUCTURE

```
src/
├── cli/            # Commander CLI entry + 3 sub-commands (inspect, analyze, generate)
├── adapters/       # External system adapters (opencode client, sessions)
├── analyze/        # Core analysis pipeline (evidence, claims, constraints, category merge)
├── generate/       # Skill rendering pipeline (composer, skill-plan, render-skill)
├── llm/            # LLM abstraction (provider registry, OpenAI-compatible, retry, trace, prompts)
├── normalize/      # Session normalization + type models
├── persist/        # Staged directory write (security: no traversal, no absolute paths)
├── profile/        # Heuristic profiling (v2 with merged claims)
└── shared/         # Error hierarchy (CliUsageError, OpenCodeAdapterError, LlmProviderError)
tests/
├── e2e/            # E2E tests (spawn real CLI, require build + opencode on PATH)
├── fixtures/       # Typed test data factories
├── golden/         # Manual golden files (readFileSync + toBe, not vitest snapshots)
└── mock-provider.ts  # Scenario-based MockLlmProvider (success/timeout/malformed-json/network-error)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a CLI command | `src/cli/commands/` | Register in `src/cli/main.ts` |
| Modify analysis pipeline | `src/analyze/` | Largest module (12 files). Evidence → claims → category merge |
| Change LLM provider | `src/llm/` | Only module with barrel export (`index.ts`). Provider registry pattern |
| Add prompt templates | `src/llm/prompts/` | Has its own barrel. Uses `createPromptRegistry` |
| Modify skill output | `src/generate/` | Composer → skill-plan → render-skill pipeline |
| Add test data | `tests/fixtures/` | Typed .ts fixture modules |
| Add golden file | `tests/golden/` | Manual comparison, not vitest snapshots |
| Fix error handling | `src/shared/errors.ts` | 3 custom error classes + `toErrorMessage` |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `main` | function | `src/cli/main.ts` | CLI entry point, Commander program |
| `registerAnalyzeCommand` | function | `src/cli/commands/analyze.ts` | `analyze` sub-command |
| `registerGenerateCommand` | function | `src/cli/commands/generate.ts` | `generate` sub-command |
| `registerInspectCommand` | function | `src/cli/commands/inspect.ts` | `inspect` sub-command |
| `CliUsageError` | class | `src/shared/errors.ts` | User-facing CLI errors |
| `OpenCodeAdapterError` | class | `src/shared/errors.ts` | OpenCode adapter failures |
| `LlmProviderError` | class | `src/shared/errors.ts` | LLM provider failures (retryable flag) |
| `LlmProviderRegistry` | class | `src/llm/registry.ts` | Provider registration/resolution |
| `OpenAiCompatibleProvider` | class | `src/llm/openai-compatible.ts` | OpenAI-compatible API adapter |
| `MockLlmProvider` | class | `tests/mock-provider.ts` | Test mock with scenario queue |
| ConstraintLabel | type | `src/normalize/models.ts` | 4 canonical labels: minimal-diff, preserve-patterns, type-safety, avoid-destructive-actions |

## CONVENTIONS

- **ESM-only**: `"type": "module"` + `NodeNext` resolution. ALL imports MUST use `.js` extensions (e.g., `"./errors.js"`). TypeScript will fail without them.
- **`import type` enforced**: `verbatimModuleSyntax: true` means type-only imports MUST use `import type { X }`.
- **No barrel files** (except `src/llm/` and `src/llm/prompts/`). All other modules import directly by file path.
- **Custom error hierarchy**: Throw `CliUsageError` for user errors, `OpenCodeAdapterError` for adapter failures, `LlmProviderError` for LLM issues. Top-level catch in `main.ts` uses `toErrorMessage(error: unknown)`.
- **No linter/formatter** configured. No eslint, prettier, or biome.
- **Test naming**: `*.test.ts` only (no `.spec.ts`). Tests in `tests/` except 2 co-located in `src/` for LLM-intensive units.

## ANTI-PATTERNS (THIS PROJECT)

- **DO NOT** add barrel `index.ts` files to modules that don't already have one (only `src/llm/` has one)
- **DO NOT** use vitest `toMatchSnapshot` — golden files use manual `readFileSync` + `toBe` comparison
- **DO NOT** use `vi.mock()` broadly — use `MockLlmProvider` from `tests/mock-provider.ts` instead
- **DO NOT** add new npm dependencies without strong justification (project is intentionally lean: only `commander` + `@opencode-ai/sdk` runtime deps)
- **DO NOT** run e2e tests without building first (`npm run build` required — preflight check verifies `dist/cli/main.js`)
- **DO NOT** commit `.session2skills/` or `generated-skills/` (gitignored runtime output)
- **DO NOT** use `any` type — `strict: true` enforced

## UNIQUE STYLES

- **Constraint taxonomy**: 4 canonical constraint labels (`minimal-diff`, `preserve-patterns`, `type-safety`, `avoid-destructive-actions`) detected via regex from user messages, rendered as "Constraints and anti-patterns" in SKILL.md
- **Composer validation**: LLM composer output is strictly validated — section IDs, directive IDs, and claim IDs must match exactly or it throws
- **Hybrid mode privacy**: Raw session evidence sent to user-configured LLM endpoint. `rawOutput` in traces NOT persisted by default (opt-in only)
- **Staged directory write**: File output uses security constraints — no directory traversal (`..`), no absolute paths

## COMMANDS

```bash
npm run build        # tsc -p tsconfig.json
npm run typecheck    # tsc --noEmit
npm run dev          # tsx src/cli/main.ts (no build needed)
npm run start        # node dist/cli/main.js
npm test             # vitest run (all tests, serial execution)
npm run test:e2e     # vitest run tests/e2e/ (requires build + .env + opencode on PATH)
```

## NOTES

- E2e tests are **serial** (`fileParallelism: false`) with 5-minute timeouts because they call real LLM APIs
- `src/shared/cli.ts` is NOT a CLI entry point — it contains argument parsers (`parsePositiveInteger`, `parseTonePreset`)
- Hybrid mode requires env vars: `SESSION2SKILLS_LLM_BASE_URL`, `SESSION2SKILLS_LLM_MODEL`, optionally `SESSION2SKILLS_LLM_API_KEY`
- `tests/e2e/helpers.ts` has `killOrphanedOpenCodeServers()` cleanup — e2e tests spawn real `opencode serve` processes
- `.sisyphus/` directory is agent planning state, not source code
- DeepSeek requires `preferJsonObject` flag (uses `{ type: "json_object" }` instead of `json_schema`)
