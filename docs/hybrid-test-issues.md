# Hybrid Test Known Issues

Last updated: 2026-04-11

## Critical (blocks test execution)

### 1. ~~E2E hybrid tests timeout in practice~~ — FIXED

Root cause was twofold:
- Original model (glm-5 / glm-4.7) had poor structured output support, causing all LLM calls to fail or time out.
- `generate-hybrid.test.ts` ran a full preflight generate before the actual test, doubling runtime.

Fixes applied:
- Switched to `deepseek-chat` with `response_format: { type: "json_object" }` fallback (glm models don't support `json_schema`).
- Added `preferJsonObject` config flag on `OpenAiCompatibleProvider`, auto-enabled for `"deepseek"` provider.
- Added `ensureJsonHint()` to inject a json hint message when using `json_object` mode (DeepSeek requirement).
- Removed the redundant preflight probe from `generate-hybrid.test.ts` `beforeAll`.

Both tests now pass in ~190s each.

### 2. ~~`MergedClaim` type / assertion mismatch on `status` field~~ — FIXED

The assertion `expect(Object.prototype.hasOwnProperty.call(claim, "status")).toBe(false)` was incorrect:
- `analyze` writes `merged-claims.json` as `{ accepted, tentative, rejected }` with `status` on each claim.
- `generate` writes it as a flat array (accepted + tentative merged).

Fixes applied:
- `analyze-hybrid.test.ts`: reads the three-segment structure and merges `accepted + tentative` for validation.
- `generate-hybrid.test.ts`: reads the flat array directly.
- Removed the `status` field assertion entirely.

### 3. `inspect.test.ts` import missing `.js` extension — OPEN

```ts
// inspect.test.ts:10
import { ... } from "./helpers";    // no .js
```

All other e2e files use `"./helpers.js"`. ESM resolution may fail on certain Node versions.

## Moderate (reliability / maintainability)

### 4. ~~`generate-hybrid.test.ts` runs full LLM generation twice~~ — FIXED

Removed the preflight probe from `beforeAll`. Only basic checks (`preflightChecks()` + `getHybridEnv()`) remain.

### 5. No `vitest.config.ts` — OPEN

Configuration is split between `package.json` CLI args (`--pool=forks --poolOptions.forks.singleFork=true`) and per-test inline timeouts (`300000`, `120000`, `60000`). A shared config file would centralise timeout, pool, and coverage settings.

### 6. Helpers hardcode the model name — OPEN

```ts
// tests/e2e/helpers.ts:81
vars["SESSION2SKILLS_LLM_MODEL"] = "deepseek-chat";
```

Cannot override the model via environment variable; editing source is required.

### 7. `killOrphanedOpenCodeServers()` may kill user processes — OPEN

```ts
// tests/e2e/helpers.ts:92
spawnSync("pkill", ["-f", "opencode serve"]);
```

`pkill -f` matches any process whose command line contains "opencode serve", including non-test instances.

## Minor (code quality)

### 8. `parseGenerateOutput` relies on fragile stdout scanning — OPEN

```ts
// generate-hybrid.test.ts:37-39
const jsonStart = trimmed.lastIndexOf("\n{");
```

Breaks if the CLI changes log output format or the JSON payload contains a leading newline.

### 9. `generate-profile.test.ts` mutates shared preflight data in-place — OPEN

Line 197 writes a sentinel `planID` into `hybridAnalyzeDir/skill-plan.json`. If Vitest reorders test execution, later tests may see the mutated data.

### 10. Error messages differ between commands — OPEN

- `analyze-hybrid.test.ts:211` — `"Hybrid mode requires..."`
- `generate-hybrid.test.ts:200` — `"Hybrid generation requires..."`

## LLM provider compatibility notes

DeepSeek requires `response_format: { type: "json_object" }` instead of `{ type: "json_schema", ... }`. The `preferJsonObject` flag on `OpenAiCompatibleProvider` handles this. When enabled, the client also injects a "Respond with valid JSON only" user message to satisfy DeepSeek's requirement that the prompt must contain the word "json".
