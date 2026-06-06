# Hybrid Test Known Issues

Last updated: 2026-04-12

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

### 3. ~~`inspect.test.ts` import missing `.js` extension~~ — FIXED

Changed `inspect.test.ts:10` from `from "./helpers"` to `from "./helpers.js"` to match all other E2E test files.

## Moderate (reliability / maintainability)

### 4. ~~`generate-hybrid.test.ts` runs full LLM generation twice~~ — FIXED

Removed the preflight probe from `beforeAll`. Only basic checks (`preflightChecks()` + `getHybridEnv()`) remain.

### 5. ~~No `vitest.config.ts`~~ — FIXED

Created `vitest.config.ts` with `pool: "forks"`, `singleFork: true`, and centralized timeouts. Simplified `package.json` `test:e2e` script to just `vitest run tests/e2e/`.

### 6. ~~Helpers hardcode the model name~~ — FIXED

`helpers.ts` now reads `SESSION2SKILLS_LLM_MODEL` and `SESSION2SKILLS_LLM_PROVIDER` from environment variables with `glm-4.7` / `zhipuai` as fallback defaults.

### 7. ~~`killOrphanedOpenCodeServers()` may kill user processes~~ — FIXED

Replaced `pkill -f "opencode serve"` with PID-tracked cleanup:
- `runCLI()` snapshots OpenCode server PIDs before and after each CLI invocation.
- `killOrphanedOpenCodeServers()` kills only tracked PIDs via `process.kill()`.
- Removed `killOrphanedOpenCodeServers()` from `afterEach` in `inspect.test.ts` and `tone-presets.test.ts` (kept only in `afterAll`).

## Minor (code quality)

### 8. ~~`parseGenerateOutput` relies on fragile stdout scanning~~ — FIXED

Replaced single `lastIndexOf("\n{")` with iterative fallback: walks backward through candidate JSON starting positions, attempting `JSON.parse` at each. Falls through to full-string parse as last resort.

### 9. ~~`generate-profile.test.ts` mutates shared preflight data in-place~~ — FIXED

The sentinel test now copies `skill-plan.json`, `merged-claims.json`, and `profile.json` to an isolated temp directory before mutating, and points `--profile` at the copy.

### 10. ~~Error messages differ between commands~~ — FIXED

Extracted `HYBRID_LLM_ENV_REQUIRED` constant to `src/shared/errors.ts`. Both `analyze.ts` and `generate.ts` now use the same message. Updated `generate-hybrid.test.ts` assertion to match.

## LLM provider compatibility notes

DeepSeek requires `response_format: { type: "json_object" }` instead of `{ type: "json_schema", ... }`. The `preferJsonObject` flag on `OpenAiCompatibleProvider` handles this. When enabled, the client also injects a "Respond with valid JSON only" user message to satisfy DeepSeek's requirement that the prompt must contain the word "json".
