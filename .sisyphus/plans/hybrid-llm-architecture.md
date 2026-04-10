# Hybrid LLM Architecture Plan: session2skills

## TL;DR

> **Quick Summary**: Redesign the current rule-only pipeline into a deterministic-core, evidence-cited hybrid system. Keep acquisition/normalization/persistence deterministic, introduce LLMs only after evidence indexing, and force all LLM output through schema validation and deterministic merge before any final markdown is generated.
>
> **Deliverables**:
> - provider-neutral `src/llm/*` abstraction with OpenAI-compatible-first support
> - evidence index + claim pipeline artifacts
> - hybrid `ProfileV2` + `skill-plan.json`
> - deterministic `summary.md` + constrained LLM `SKILL.md`
> - regression suite covering merge safety and output usefulness
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: taxonomy/schema foundation → evidence index + prompt packets → LLM claims + merge → skill plan + final generation

---

## Context

### Original Request
直接设计完整 hybrid 架构，通过引入 LLM 明显提升 session 提取质量与 `SKILL.md` 生成质量。

### Interview Summary
**Key Discussions**:
- 当前系统为 TypeScript CLI，现有链路是 `OpenCode adapter -> normalize -> heuristic analyzers -> preference profile -> render summary/SKILL`
- 当前 extraction 与 generation 都是规则/模板驱动，工程骨架不错，但 evidence -> instruction 质量不足
- 用户明确选择直接设计完整 hybrid 架构，而不是只做 generation-only 或 extraction-only 过渡方案
- 用户默认有技术基础，允许保留较多调试工件与架构复杂度，只要质量明显提升
- 第一版 provider 策略选择为 **OpenAI-compatible abstract slot**
- 第一版分析规模选择为 **5-20 sessions 小批量高解释性**
- 成功标准优先级选择为 **better output usefulness**，即最终 `SKILL.md` / `summary.md` 更有用、更像用户本人
- 测试策略选择为 **tests-after + agent QA**
- 远程数据策略选择为 **默认发送 raw evidence**

**Research Findings**:
- 当前仓库已经具备良好的 deterministic spine：`normalized.json`、`profile.json`、evidence refs、staged writes、独立 analyze/generate 流程
- 当前最大短板不是 adapter，而是 analyze/generate 的表达力：`extract-*` 太粗，`render-skill.ts` 太模板化
- `normalize-session.ts` 仍泄漏 OpenCode-specific 类型，这会阻碍未来 provider 扩展
- 现有会话过滤与 communication/constraint extraction 召回率低，正适合 hybrid 方案中由 LLM 介入

### Metis Review
**Identified Gaps** (addressed):
- 缺少 provider/model slot 边界 → 已固定为 OpenAI-compatible abstract slot
- 缺少规模目标 → 已固定为 5-20 sessions 小批量场景
- 缺少成功定义 → 已固定为“输出更有用”优先
- 缺少 scope lock → 已明确不做 embeddings/vector DB、streaming、多 provider 真实现、interactive refinement、feedback loop

---

## Work Objectives

### Core Objective
把当前“规则提取 + 模板渲染”的 MVP 重构为“规则与 LLM 共同产出 claims，deterministic merge 后再生成最终工件”的 hybrid 架构，同时保留可追踪、可调试、可回归验证的本地 CLI 特性。

### Concrete Deliverables
- `src/llm/` provider abstraction
- provider-neutral evidence/claim/profile/skill-plan schema
- `evidence-index.json`, `rule-claims.json`, `llm-session-claims.json`, `llm-category-claims.json`, `merged-claims.json`, `profile.json`(v2), `skill-plan.json`, `llm-traces.json`
- deterministic `summary.md`
- constrained LLM `SKILL.md`
- backward-safe CLI integration to existing `analyze` / `generate`

### Definition of Done
- [ ] `analyze` 能在 5-20 个 sessions 上产出完整 hybrid 工件集
- [ ] 所有 LLM claims 都引用有效 `evidenceID`
- [ ] merge 阶段能 deterministic 地接受/暂挂/拒绝 claims
- [ ] `summary.md` 能作为 debug artifact 审计 claims 来源
- [ ] `SKILL.md` 明显比当前模板化输出更具体、更可操作
- [ ] `npm run typecheck && npm test && npm run build` 全部通过

### Must Have
- evidence-first pipeline
- 统一 claim schema，规则与 LLM 同形输出
- deterministic merge 为最终裁决
- LLM 输出必须 schema-validated
- 保留现有 CLI 使用方式，不引入 UI

### Must NOT Have (Guardrails)
- 不做 raw sessions -> one-shot `SKILL.md`
- 不允许无 `evidenceID` 的 LLM claims 进入 merge
- 不在 v1 实现多 provider 真支持，只做 abstraction
- 不引入 embeddings/vector DB / streaming / multi-turn orchestration
- 不让最终 prose 在 merge 前越级生成

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: vitest

### QA Policy
每个任务都必须至少包含：
- 1 个 schema / unit 验证
- 1 个 CLI 或集成场景
- 1 个错误/冲突/降级场景

Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```text
Wave 1 (Foundation):
├── Task 1: Define hybrid taxonomy + schemas
├── Task 2: Introduce provider-neutral LLM abstraction
├── Task 3: Refactor normalization boundary for provider-neutral raw inputs
├── Task 4: Extend staged artifact model for hybrid run outputs
└── Task 5: Define prompt/version/trace conventions

Wave 2 (Claims pipeline):
├── Task 6: Build evidence index generator
├── Task 7: Convert rule extractors to candidate-claim producers
├── Task 8: Build prompt packet builder (session map + category reduce)
├── Task 9: Implement LLM session extractor
└── Task 10: Implement LLM category reducer

Wave 3 (Resolution + outputs):
├── Task 11: Implement deterministic claim validator + merge engine
├── Task 12: Build ProfileV2 + confidence/unresolved model
├── Task 13: Build skill-plan.json planner
├── Task 14: Rewrite summary generation around merged claims
└── Task 15: Build constrained LLM SKILL composer + fallback path

Wave 4 (Integration + hardening):
├── Task 16: Integrate hybrid mode into analyze/generate CLI
├── Task 17: Add caching, prompt/version traces, and failure fallback
├── Task 18: Add tests, fixtures, snapshots, and mock provider coverage
└── Task 19: Update docs and artifact interpretation guide

Wave FINAL:
├── Task F1: Plan compliance audit
├── Task F2: Code quality review
├── Task F3: Real hybrid QA execution
└── Task F4: Scope fidelity check
```

### Dependency Matrix

- **1**: none → 6,7,8,11,12,13
- **2**: none → 9,10,15,16,17,18
- **3**: none → 6,7,16
- **4**: none → 16,17,18,19
- **5**: none → 8,9,10,15,17,18
- **6**: 1,3 → 8,9,10,11,12
- **7**: 1,3 → 11,12
- **8**: 1,5,6 → 9,10
- **9**: 2,5,8 → 11,17,18
- **10**: 2,5,8 → 11,17,18
- **11**: 1,6,7,9,10 → 12,13,14,15,16,18
- **12**: 1,6,7,11 → 13,14,15,16,18
- **13**: 1,11,12 → 15,16,18
- **14**: 11,12 → 16,18,19
- **15**: 2,5,11,12,13 → 16,17,18,19
- **16**: 2,3,4,11,12,13,14,15 → 17,18,19
- **17**: 2,4,5,9,10,15,16 → 18,19
- **18**: 2,4,5,9,10,11,12,13,14,15,16,17 → F1-F4
- **19**: 4,14,15,16,17 → F1-F4

### Agent Dispatch Summary

- **Wave 1**: T1 `ultrabrain`, T2 `unspecified-high`, T3 `deep`, T4 `quick`, T5 `writing`
- **Wave 2**: T6 `deep`, T7 `unspecified-high`, T8 `deep`, T9 `unspecified-high`, T10 `deep`
- **Wave 3**: T11 `ultrabrain`, T12 `deep`, T13 `writing`, T14 `writing`, T15 `unspecified-high`
- **Wave 4**: T16 `deep`, T17 `unspecified-high`, T18 `unspecified-high`, T19 `writing`
- **Final**: F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Define hybrid taxonomy and JSON schemas

  **What to do**:
  - Introduce versioned schema/types for `RunManifest`, `EvidenceItem`, `CandidateClaim`, `MergedClaim`, `ProfileV2`, `SkillPlan`, `LLMTrace`
  - Bound label taxonomies for the 4 existing dimensions while allowing controlled extension
  - Define artifact versioning and prompt-set version fields

  **Must NOT do**:
  - Do not let LLM output freeform untyped objects into the pipeline
  - Do not couple schema to a specific provider response format

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: type/system boundary design and future-proof schema work
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 6,7,8,11,12,13
  - **Blocked By**: None

  **References**:
  - `src/normalize/models.ts` - current internal model baseline to evolve, not discard
  - `src/profile/build-profile.ts` - current profile shape and confidence-note behavior
  - `src/generate/render-summary.ts` - current summary expectations that future schema must feed

  **Acceptance Criteria**:
  - [x] New schema/types compile under strict TS
  - [x] Existing profile concepts are representable in the new schema
  - [x] Version fields exist for artifacts and prompts

  **QA Scenarios**:
  ```
  Scenario: Schema compiles and supports current profile concepts
    Tool: Bash
    Preconditions: updated schema/type files implemented
    Steps:
      1. Run `npm run typecheck`
      2. Assert exit code 0
      3. Run a focused test file or temporary type fixture compile that instantiates all major schema types
    Expected Result: typecheck passes with no `any`/compatibility regressions
    Evidence: .sisyphus/evidence/task-1-schema-typecheck.txt

  Scenario: Invalid uncited claim shape is rejected
    Tool: Bash
    Preconditions: runtime/schema validator implemented
    Steps:
      1. Feed a test fixture claim object missing `evidenceIDs`
      2. Run validator test
    Expected Result: validation fails with explicit error mentioning missing `evidenceIDs`
    Evidence: .sisyphus/evidence/task-1-invalid-claim.txt
  ```

- [x] 2. Introduce provider-neutral LLM abstraction

  **What to do**:
  - Add `src/llm/*` abstraction with OpenAI-compatible-first provider adapter
  - Separate structured-output generation from text generation
  - Support provider/model metadata, timeout, usage, and retries in a provider-neutral result type

  **Must NOT do**:
  - Do not wire multiple concrete providers in v1
  - Do not leak provider SDK types into analyze/profile/generate layers

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 9,10,15,16,17,18
  - **Blocked By**: None

  **References**:
  - `package.json` - current dependency/runtime expectations
  - `src/adapters/opencode/client.ts` - example of current provider-specific boundary
  - `src/shared/errors.ts` - error typing conventions to preserve

  **Acceptance Criteria**:
  - [ ] Core business layers depend only on provider-neutral interfaces
  - [ ] Structured JSON generation and plain text generation are separate methods
  - [ ] Provider/model/version metadata can be persisted into traces

  **QA Scenarios**:
  ```
  Scenario: Mock provider can satisfy structured extraction contract
    Tool: Bash
    Preconditions: mock/fake provider test implemented
    Steps:
      1. Run vitest on LLM abstraction tests
      2. Assert returned object includes parsed payload and provider metadata
    Expected Result: tests pass without network access
    Evidence: .sisyphus/evidence/task-2-mock-provider.txt

  Scenario: Provider timeout falls back cleanly
    Tool: Bash
    Preconditions: timeout simulation test exists
    Steps:
      1. Run timeout test with mocked delayed provider
    Expected Result: explicit timeout error or fallback path is emitted deterministically
    Evidence: .sisyphus/evidence/task-2-timeout.txt
  ```

- [x] 3. Refactor normalization boundary for provider-neutral raw inputs

  **What to do**:
  - Stop importing adapter-specific types directly into normalization
  - Introduce a provider-neutral raw session/message/part contract before normalization
  - Preserve existing normalized semantics while decoupling source-specific shapes

  **Must NOT do**:
  - Do not rewrite normalize semantics unnecessarily
  - Do not break current OpenCode ingestion behavior

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 6,7,16
  - **Blocked By**: None

  **References**:
  - `src/normalize/normalize-session.ts` - current layer leak to remove
  - `src/adapters/opencode/sessions.ts` - source-specific raw shapes currently consumed
  - `tests/normalize-session.test.ts` - behavior that must remain stable

  **Acceptance Criteria**:
  - [ ] `normalize-session.ts` no longer imports OpenCode-specific session-message result types
  - [ ] Existing normalization tests still pass
  - [ ] OpenCode adapter remains functional through translation layer

  **QA Scenarios**:
  ```
  Scenario: Normalization behavior remains stable after boundary refactor
    Tool: Bash
    Preconditions: normalization refactor completed
    Steps:
      1. Run `npm test -- --run tests/normalize-session.test.ts`
    Expected Result: normalization tests pass unchanged or with intentional snapshot updates only
    Evidence: .sisyphus/evidence/task-3-normalize-stability.txt

  Scenario: OpenCode-backed analyze still produces normalized artifacts
    Tool: Bash
    Preconditions: local OpenCode sessions available
    Steps:
      1. Run `node dist/cli/main.js analyze --directory <project> --recent 3 --out .session2skills/runs/task-3-check --force`
    Expected Result: `normalized.json` is produced successfully
    Evidence: .sisyphus/evidence/task-3-live-analyze.txt
  ```

- [x] 4. Extend staged artifact model for hybrid run outputs

  **What to do**:
  - Extend staged directory writer so hybrid runs can write the expanded artifact set safely
  - Decide whether nested subpaths are needed; if yes, support them safely
  - Ensure overwrite behavior remains explicit and non-destructive

  **Must NOT do**:
  - Do not lose current overwrite protections
  - Do not silently mix old and new artifact generations in one output path

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 16,17,18,19
  - **Blocked By**: None

  **References**:
  - `src/persist/staged-directory-write.ts` - current flat artifact write mechanism
  - `src/persist/run-store.ts` - current analyze artifact layout
  - `src/persist/generated-artifacts.ts` - current generate artifact layout

  **Acceptance Criteria**:
  - [ ] Expanded hybrid artifact set writes atomically enough for current CLI expectations
  - [ ] Existing overwrite refusal/force flows still work
  - [ ] Artifact paths are deterministic

  **QA Scenarios**:
  ```
  Scenario: Hybrid artifact set writes safely
    Tool: Bash
    Preconditions: writer changes implemented
    Steps:
      1. Run staged write test suite
      2. Validate all expected hybrid files exist in output directory
    Expected Result: write passes and file list matches expected manifest
    Evidence: .sisyphus/evidence/task-4-hybrid-writer.txt

  Scenario: Re-run without `--force` is refused
    Tool: Bash
    Preconditions: output directory already populated
    Steps:
      1. Re-run same analyze/generate path without `--force`
    Expected Result: non-zero exit and clear refusal message
    Evidence: .sisyphus/evidence/task-4-overwrite-refusal.txt
  ```

- [x] 5. Define prompt/version/trace conventions

  **What to do**:
  - Version prompts and taxonomy explicitly
  - Define trace payload shape for prompt input, parsed output, usage, latency, provider/model metadata
  - Decide what gets persisted by default vs optional raw response capture

  **Must NOT do**:
  - Do not leave prompt evolution unversioned
  - Do not persist unbounded raw outputs without policy

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 8,9,10,15,17,18
  - **Blocked By**: None

  **References**:
  - `src/generate/render-summary.ts` - debug-first artifact precedent
  - `src/persist/run-store.ts` - current artifact naming approach
  - `package.json` - current CLI/runtime environment

  **Acceptance Criteria**:
  - [ ] Every LLM call can be traced back to prompt version, provider, model, and input artifact
  - [ ] Trace policy distinguishes safe persisted metadata from optional raw text

  **QA Scenarios**:
  ```
  Scenario: LLM trace artifact includes minimum required provenance
    Tool: Bash
    Preconditions: trace generation implemented
    Steps:
      1. Run hybrid analyze with mocked provider
      2. Inspect persisted trace artifact
    Expected Result: trace contains promptID, model, provider, input artifact ref, parsed output, latency
    Evidence: .sisyphus/evidence/task-5-trace-artifact.txt

  Scenario: Missing prompt version is rejected by tests
    Tool: Bash
    Preconditions: validator test exists
    Steps:
      1. Run test with malformed trace metadata
    Expected Result: test fails with explicit versioning error
    Evidence: .sisyphus/evidence/task-5-version-guard.txt
  ```

- [x] 6. Build evidence index generator

  **What to do**:
  - Flatten normalized sessions into stable `EvidenceItem` entries with compact IDs
  - Tag evidence for likely dimensions (`constraint`, `validation`, `direct-user`, `tool`, etc.)
  - Preserve session/message/part provenance and excerpts optimized for prompting

  **Must NOT do**:
  - Do not send raw normalized blobs directly to LLM prompts
  - Do not generate unstable evidence IDs across repeated runs on same input

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 8,9,10,11,12
  - **Blocked By**: 1,3

  **Acceptance Criteria**:
  - [x] Same input yields stable evidence IDs
  - [x] Evidence entries are sufficient for LLM prompting without re-reading normalized session trees
  - [x] Direct-user instructions are distinguishable from derived/tool evidence

  **QA Scenarios**:
  ```
  Scenario: Evidence IDs are stable across reruns
    Tool: Bash
    Steps:
      1. Run analyze twice on same fixture/session set
      2. Diff `evidence-index.json`
    Expected Result: stable IDs and deterministic ordering
    Evidence: .sisyphus/evidence/task-6-evidence-stability.txt

  Scenario: Evidence index supports category packet building
    Tool: Bash
    Steps:
      1. Run evidence index unit/integration tests
    Expected Result: validation confirms each evidence item includes required prompt fields
    Evidence: .sisyphus/evidence/task-6-evidence-shape.txt
  ```

- [x] 7. Convert rule extractors to candidate-claim producers

  **What to do**:
  - Change rule extractors from direct `WorkflowSignal[]` output to shared `CandidateClaim[]`
  - Preserve current useful heuristics, especially validation habits
  - Separate explicit-user constraints from inferred work-style heuristics

  **Must NOT do**:
  - Do not drop current rule-based fallback capabilities
  - Do not let rule claims bypass shared taxonomy/schema

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 11,12
  - **Blocked By**: 1,3

  **Acceptance Criteria**:
  - [ ] Existing heuristic knowledge is preserved but emitted in unified claim shape
  - [ ] Validation-habit extraction remains deterministic and strong
  - [ ] Rule outputs are merge-ready and traceable

- [x] 8. Build prompt packet builder for map-reduce extraction

  **What to do**:
  - Build token-bounded prompt packets for per-session map and per-category reduce stages
  - Include taxonomy, evidence IDs, and output JSON contract in prompt inputs
  - Prefer evidence-first compact packets over raw session dumps

  **Must NOT do**:
  - Do not exceed expected small-batch design by building giant all-history prompts
  - Do not omit counter-evidence opportunities from packets

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 9,10
  - **Blocked By**: 1,5,6

  **Acceptance Criteria**:
  - [x] Session map packets and category reduce packets are deterministic
  - [x] Packet size is bounded for 5-20 session design target
  - [x] Packets include enough structured context for valid evidence citation

- [x] 9. Implement LLM session extractor

  **What to do**:
  - For each session packet, ask LLM for structured candidate claims with `evidenceIDs` and optional `counterEvidenceIDs`
  - Parse and validate structured output
  - Persist per-session LLM claims and traces

  **Must NOT do**:
  - Do not accept malformed or uncited claims
  - Do not let model self-confidence directly determine final acceptance

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 11,17,18
  - **Blocked By**: 2,5,8

  **Acceptance Criteria**:
  - [x] Every accepted session-level LLM claim passes schema validation
  - [x] Invalid `evidenceID` references are rejected deterministically
  - [x] Trace artifacts record prompt/model/latency provenance

- [x] 10. Implement LLM category reducer

  **What to do**:
  - Reduce session-level claims into category-level synthesized claims for the 4 dimensions
  - Allow reducer to surface conflicts and weak evidence areas
  - Persist reduced claims separately from merged final claims

  **Must NOT do**:
  - Do not collapse directly to final profile without deterministic merge stage
  - Do not let reducer invent new uncited evidence

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 11,17,18
  - **Blocked By**: 2,5,8

  **Acceptance Criteria**:
  - [x] Category reducer output is schema-valid and evidence-cited
  - [x] Conflicts and low-confidence areas are explicitly surfaced

- [x] 11. Implement deterministic claim validator and merge engine

  **What to do**:
  - Validate all rule and LLM claims against taxonomy and evidence index
  - Merge by label normalization, evidence union, agreement bonuses, contradiction penalties, and session coverage
  - Produce `accepted`, `tentative`, `rejected` claims deterministically

  **Must NOT do**:
  - Do not let LLM claims bypass validation
  - Do not use model confidence as final truth

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential core
  - **Blocks**: 12,13,14,15,16,18
  - **Blocked By**: 1,6,7,9,10

  **Acceptance Criteria**:
  - [ ] Merging is deterministic on repeated runs with same inputs and cached model outputs
  - [ ] Contradictions are surfaced, not hidden
  - [ ] Unsupported or invalid claims are rejected cleanly

  **QA Scenarios**:
  ```
  Scenario: Rule and LLM agreement increases claim acceptance
    Tool: Bash
    Steps:
      1. Run merge tests with matching rule + llm claims on same label
    Expected Result: merged claim status is `accepted` with higher score than either input alone
    Evidence: .sisyphus/evidence/task-11-agreement-merge.txt

  Scenario: Invalid evidence citation is rejected
    Tool: Bash
    Steps:
      1. Feed llm claim citing nonexistent evidence ID
      2. Run merge/validation tests
    Expected Result: claim rejected and warning recorded
    Evidence: .sisyphus/evidence/task-11-invalid-citation.txt
  ```

- [ ] 12. Build ProfileV2 and unresolved/confidence model

  **What to do**:
  - Replace thin current profile with claim-backed `ProfileV2`
  - Separate strongest signals, accepted/tentative claims, unresolved areas, and confidence notes
  - Preserve enough shape compatibility for CLI preview and downstream generation

  **Must NOT do**:
  - Do not reduce the profile back to bare label arrays only
  - Do not hide uncertainty when evidence is weak

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 13,14,15,16,18
  - **Blocked By**: 1,6,7,11

  **Acceptance Criteria**:
  - [x] `ProfileV2` can power both debug summary and final skill generation
  - [x] Confidence/unresolved information survives into persisted artifacts

- [x] 13. Build skill-plan.json planner

  **What to do**:
  - Translate accepted claims into a constrained `skill-plan.json`
  - Define allowed/fallback directives per section
  - Distinguish claims that may appear in summary only vs skill directives

  **Must NOT do**:
  - Do not let final composer see rejected claims
  - Do not lose fallback defaults when evidence is sparse

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 15,16,18
  - **Blocked By**: 1,11,12

  **Acceptance Criteria**:
  - [x] Skill plan only references accepted/tentative claims allowed by policy
  - [x] Each output section has explicit fallback behavior

- [x] 14. Rewrite summary generation around merged claims

  **What to do**:
  - Make `summary.md` the deterministic audit artifact for the hybrid system
  - Show strongest claims, confidence notes, unresolved items, and evidence-backed excerpts
  - Keep it debuggable and more informative than final `SKILL.md`

  **Must NOT do**:
  - Do not turn summary into marketing prose
  - Do not hide provenance details that matter for debugging

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 16,18,19
  - **Blocked By**: 11,12

  **Acceptance Criteria**:
  - [x] Summary exposes merged claims and traceability clearly
  - [x] Summary remains deterministic given same merged claims

- [ ] 15. Build constrained LLM SKILL composer with fallback path

  **What to do**:
  - Generate `SKILL.md` from `skill-plan.json` plus allowed claims only
  - Constrain composer so it cannot introduce unsupported directives
  - Keep a deterministic fallback renderer if LLM generation fails

  **Must NOT do**:
  - Do not compose directly from raw sessions or unresolved claims
  - Do not emit unsupported instructions not grounded in claim set

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 16,17,18,19
  - **Blocked By**: 2,5,11,12,13

  **Acceptance Criteria**:
  - [x] Generated `SKILL.md` is grounded in allowed claim IDs only
  - [x] Fallback path works when composer errors or returns invalid output
  - [x] Output quality is more actionable than current template bullets

  **QA Scenarios**:
  ```
  Scenario: Composer writes supported instructions only
    Tool: Bash
    Steps:
      1. Run hybrid generate on fixture/profile inputs
      2. Compare final SKILL content against allowed claim IDs / skill-plan
    Expected Result: every non-fallback directive maps to an allowed claim
    Evidence: .sisyphus/evidence/task-15-skill-grounding.txt

  Scenario: Composer failure falls back deterministically
    Tool: Bash
    Steps:
      1. Force mocked composer failure/invalid JSON
      2. Run generate
    Expected Result: fallback renderer produces valid `SKILL.md` and emits warning
    Evidence: .sisyphus/evidence/task-15-fallback.txt
  ```

- [x] 16. Integrate hybrid mode into analyze/generate CLI

  **What to do**:
  - Extend analyze/generate flows to produce and consume hybrid artifacts
  - Preserve current command surface where possible
  - Make hybrid mode explicit and inspectable through output artifacts and final JSON summary

  **Must NOT do**:
  - Do not break current basic generate-from-profile workflow without migration path
  - Do not silently mix rule-only and hybrid outputs without manifest/version metadata

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: 17,18,19
  - **Blocked By**: 2,3,4,11,12,13,14,15

  **Acceptance Criteria**:
  - [ ] CLI can produce full hybrid artifact sets in analyze mode
  - [ ] CLI can generate summary/skill from hybrid artifacts or profile as designed
  - [ ] Existing user mental model (`inspect` → `analyze` → `generate`) remains intact

- [x] 17. Add caching, traces, and failure fallback

  **What to do**:
  - Cache LLM outputs by normalized input hash + prompt version + model
  - Persist traces and warnings
  - Ensure provider timeout/malformed output fall back deterministically where applicable

  **Must NOT do**:
  - Do not make repeated runs needlessly recompute identical LLM work
  - Do not swallow LLM failures silently

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: 18,19
  - **Blocked By**: 2,4,5,9,10,15,16

  **Acceptance Criteria**:
  - [ ] repeated identical runs can reuse cached LLM artifacts
  - [ ] malformed/timeout paths are visible in warnings/traces
  - [ ] analyze/generate still complete when fallback policy allows

- [x] 18. Add tests, fixtures, snapshots, and mock-provider coverage

  **What to do**:
  - Add unit tests for evidence index, claim validation, merge scoring, skill-plan generation
  - Add fixture/snapshot tests for merged claims and summary/skill artifacts
  - Add mock provider tests so CI remains deterministic

  **Must NOT do**:
  - Do not rely on live network/provider for core CI correctness
  - Do not skip regression coverage for merge and fallback paths

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: 2,4,5,9,10,11,12,13,14,15,16,17

  **Acceptance Criteria**:
  - [ ] hybrid core has deterministic automated test coverage
  - [ ] snapshots/goldens exist for merged claims and final artifacts
  - [ ] mock provider tests cover malformed output, timeout, and fallback

- [x] 19. Update docs and artifact interpretation guide

  **What to do**:
  - Document hybrid artifact tree and meaning of each file
  - Explain how technical users inspect `summary.md`, `merged-claims.json`, `skill-plan.json`, and `llm-traces.json`
  - Document raw-evidence remote sending default and provider configuration model

  **Must NOT do**:
  - Do not oversell the system as fully autonomous or hallucination-free
  - Do not hide the privacy tradeoff of raw-evidence sending

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: 4,14,15,16,17

  **Acceptance Criteria**:
  - [ ] README/docs let a technical user understand and inspect hybrid artifacts end-to-end
  - [ ] privacy/provider defaults are explicitly documented

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle` (executed as `ultrabrain`)
  Verify all hybrid artifacts, guardrails, and CLI flows match this plan. Ensure no raw-sessions-to-one-shot generation path was introduced.

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck`, `npm test`, `npm run build`; inspect new `src/llm/*`, merge, and schema layers for complexity creep, `any`, silent catches, and provider leakage.

- [x] F3. **Real Hybrid QA** — `unspecified-high`
  Run `inspect`, `analyze`, and `generate` on a real OpenCode workspace with hybrid mode enabled; validate artifacts, traces, fallback behavior, and final markdown usefulness.

- [x] F4. **Scope Fidelity Check** — `deep`
  Confirm v1 remained within scope: OpenAI-compatible abstraction only, no embeddings/vector DB, no streaming orchestration, no UI.

---

## Commit Strategy

- **1**: `refactor(normalize): introduce provider-neutral raw session contract`
- **2**: `feat(llm): add provider-neutral llm abstraction and traces`
- **3**: `feat(analyze): add evidence index and hybrid candidate claims pipeline`
- **4**: `feat(profile): add deterministic claim merge and profile v2`
- **5**: `feat(generate): add skill-plan and constrained hybrid skill generation`
- **6**: `test(hybrid): add merge, provider, and artifact regression coverage`
- **7**: `docs(hybrid): document artifact model and hybrid workflow`

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck
npm test
npm run build
node dist/cli/main.js inspect --directory <project> --recent 5
node dist/cli/main.js analyze --directory <project> --recent 5 --out .session2skills/runs/hybrid-check --force
node dist/cli/main.js generate --directory <project> --recent 5 --output generated-skills/hybrid-check --force
```

### Final Checklist
- [ ] All hybrid artifacts are persisted with version metadata
- [ ] All LLM claims cite valid evidence IDs
- [ ] Merge engine deterministically accepts/rejects/tentatively holds claims
- [ ] `summary.md` is debug-friendly and provenance-rich
- [ ] `SKILL.md` is more actionable than current template output
- [ ] Existing CLI flow remains understandable to technical users
- [ ] No v1 scope creep beyond agreed boundaries
