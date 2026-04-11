# session2skills 端到端测试计划

## TL;DR

> **Quick Summary**: 为 session2skills CLI 工具创建完整的端到端测试套件，覆盖 inspect、analyze、generate 三条命令，Legacy 和 Hybrid 双模式，使用真实 OpenCode 会话 + 真实 LLM API（GLM coding plan），持久化存储在 tests/e2e/ 目录。
> 
> **Deliverables**:
> - `tests/e2e/` 目录，包含 7 个测试文件 + 1 个共享 helper
> - 覆盖全部 3 条 CLI 命令 × 2 种运行模式
> - 常见错误场景 + tone preset 验证
> - 可通过 `npm run test:e2e` 独立运行
> 
> **Estimated Effort**: Medium (9 个实现任务 + 4 个验证任务)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 4 → Task 5 → Task 8 → Final

---

## Context

### Original Request
对 session2skills 项目做一次详细全面的端到端测试。

### Interview Summary
**Key Discussions**:
- 测试模式：Legacy + Hybrid 都测
- 数据来源：连接真实 OpenCode（当前机器上的 opencode CLI）
- 测试范围：全链路 CLI E2E（inspect → analyze → generate）
- 错误场景：正常路径 + 常见错误
- 测试留存：持久化，留在 tests/e2e/ 目录

**Research Findings**:
- 项目是一个 CLI 工具，使用 Commander.js 框架
- CLI 通过 spawn("opencode", ["serve"]) 启动本地 OpenCode 服务器
- Hybrid 模式需要 LLM API endpoint（计划中使用 mock HTTP server 替代真实 API）
- 现有测试：Vitest 3.2.4, 15 个单元测试文件，115 个测试全部通过，无 E2E 测试
- 输出 artifacts 包含多种 JSON 文件 + markdown 文件

### Metis Review
**Identified Gaps** (addressed):
- `opencode` CLI 必须在 PATH 中：加入 pre-flight 检查，缺失时 skip 并提示
- 并发执行可能导致 OpenCode server 端口冲突：E2E 测试必须顺序运行
- Hybrid 模式使用真实 LLM API（GLM coding plan，.env 中已配置 API key）
- .env 中变量名为 Zhipu_coding_plan_BaseUrl / Zhipu_coding_plan_apikey，需映射为 CLI 期望的 SESSION2SKILLS_LLM_BASE_URL / SESSION2SKILLS_LLM_API_KEY
- CLI 不自动加载 .env 文件：测试 helpers 中读取 .env 并映射环境变量，通过 env 选项传入 child_process
- LLM 响应非确定性：验证 artifact 结构/schema，不验证 LLM 输出的精确内容
- 孤儿进程风险：加入 afterAll 清理残留 `opencode serve` 进程
- 每条 CLI 命令会启动/关闭一个 OpenCode server：测试较慢，需设 timeout

---

## Work Objectives

### Core Objective
创建一套可重复运行的、全面的 CLI 端到端测试，验证 session2skills 从会话读取到最终 SKILL.md 生成的完整流程。

### Concrete Deliverables
- `tests/e2e/helpers.ts` — 共享测试工具（runCLI, createTempDir, cleanup, pre-flight, mock LLM server）
- `tests/e2e/inspect.test.ts` — inspect 命令测试
- `tests/e2e/analyze-legacy.test.ts` — analyze legacy 模式测试
- `tests/e2e/analyze-hybrid.test.ts` — analyze hybrid 模式测试（mock LLM）
- `tests/e2e/generate-legacy.test.ts` — generate legacy 模式测试
- `tests/e2e/generate-hybrid.test.ts` — generate hybrid 模式测试（mock LLM）
- `tests/e2e/generate-profile.test.ts` — generate --profile 测试（v1 + v2）
- `tests/e2e/tone-presets.test.ts` — 三种 tone preset 结构差异验证
- `tests/e2e/error-scenarios.test.ts` — 常见错误场景测试
- `package.json` 新增 `test:e2e` 脚本

### Definition of Done
- [ ] `npx vitest run tests/e2e/` 全部通过
- [ ] 覆盖 inspect / analyze / generate 三条命令
- [ ] 覆盖 Legacy 和 Hybrid 两种模式
- [ ] 覆盖 3 种 tone preset（concise, balanced, detailed）
- [ ] 覆盖至少 6 个常见错误场景
- [ ] 所有测试使用临时目录，不影响项目文件
- [ ] 每个测试有独立的 QA 验证步骤

### Must Have
- Pre-flight 检查（opencode 可用、dist 已构建、会话存在）— 缺失时 skip 并给出明确提示
- Hybrid 模式使用真实 LLM API（从 .env 读取并映射环境变量）
- Helpers 中包含 `loadDotEnv()` 函数：读取 .env 文件，将 Zhipu_coding_plan_BaseUrl 映射为 SESSION2SKILLS_LLM_BASE_URL，将 Zhipu_coding_plan_apikey 映射为 SESSION2SKILLS_LLM_API_KEY，设置 SESSION2SKILLS_LLM_MODEL 为 "glm-5" 或合适的模型名
- 所有输出写入 `os.tmpdir()` 下的临时目录
- afterEach/afterAll 清理临时目录和残留进程
- 顺序执行（vitest --pool=forks --poolOptions.forks.singleFork=true 或测试间串行）
- 每个 artifact 验证 JSON schema（必填字段、类型）
- 每个测试设置 timeout（单次 CLI 调用 30s，整体 test timeout 60s）
- `npm run test:e2e` 脚本

### Must NOT Have (Guardrails)
- ❌ 不修改 src/ 中的任何源代码
- ❌ 不修改现有 tests/ 中的单元测试
- ❌ 不添加 npm 依赖（只用 Node.js 内置模块）
- ❌ 不使用 mock LLM server（Hybrid 测试使用真实 GLM API）
- ❌ 不向项目的真实 .session2skills/ 或 generated-skills/ 写入任何内容
- ❌ 不使用 golden file 做精确文本匹配（用结构化/schema 验证）
- ❌ 不依赖特定会话内容（只验证 artifact 结构和 schema）
- ❌ 不创建 vitest.config.ts（使用默认配置）
- ❌ 不测试 LLM 输出质量（主观、非确定性）
- ❌ 不创建测试框架或抽象层（保持 helpers 简洁内联）

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest 3.2.4)
- **Automated tests**: YES (Tests-after - E2E tests)
- **Framework**: Vitest
- **If TDD**: N/A — E2E tests, not unit tests

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI Commands**: Use Bash (child_process) - Run CLI, capture stdout/stderr/exit code, validate artifacts
- **Output Validation**: Use Bash - Parse JSON, check fields, read markdown
- **Error Scenarios**: Use Bash - Trigger errors, assert stderr messages and exit codes

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - foundation):
└── Task 1: E2E helpers + pre-flight + .env 映射 [quick]

Wave 2 (After Wave 1 - core commands):
├── Task 2: inspect command tests (depends: 1) [unspecified-high]
├── Task 3: analyze legacy tests (depends: 1) [unspecified-high]
└── Task 4: analyze hybrid tests (depends: 1) [unspecified-high]

Wave 3 (After Wave 2 - generate + profile):
├── Task 5: generate legacy tests (depends: 3) [unspecified-high]
├── Task 6: generate hybrid tests (depends: 4) [unspecified-high]
└── Task 7: generate --profile tests (depends: 3, 4) [unspecified-high]

Wave 4 (After Wave 3 - variations + errors):
├── Task 8: tone presets tests (depends: 5, 6) [unspecified-high]
└── Task 9: error scenarios tests (depends: 2) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 5 → Task 8 → Final
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Waves 2 & 3)
```

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|-----------|--------|
| 1 | - | 2, 3, 4 |
| 2 | 1 | 9 |
| 3 | 1 | 5, 7 |
| 4 | 1 | 6, 7 |
| 5 | 3 | 8 |
| 6 | 4 | 8 |
| 7 | 3, 4 | - |
| 8 | 5, 6 | - |
| 9 | 2 | - |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 3 tasks — T2 → `unspecified-high`, T3 → `unspecified-high`, T4 → `unspecified-high`
- **Wave 3**: 3 tasks — T5 → `unspecified-high`, T6 → `unspecified-high`, T7 → `unspecified-high`
- **Wave 4**: 2 tasks — T8 → `unspecified-high`, T9 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. E2E 测试基础设施 — helpers.ts + pre-flight + .env 映射 + package.json 脚本

  **What to do**:
  - 创建 `tests/e2e/` 目录
  - 创建 `tests/e2e/helpers.ts`，包含以下导出函数：
    - `runCLI(args: string[], options?: { env?: Record<string, string>, timeout?: number })`: 使用 `child_process.spawnSync` 执行 `node dist/cli/main.js`，返回 `{ status, stdout, stderr }`。默认 timeout 60000ms（Hybrid 模式需要 LLM 调用，给足时间）。env 选项会与 `process.env` 合并后传入。
    - `createTempDir(prefix?: string)`: 使用 `mkdtemp(path.join(os.tmpdir(), "session2skills-e2e-"))` 创建临时目录，返回路径
    - `cleanupDir(dir: string)`: 使用 `rm(dir, { recursive: true, force: true })` 清理目录
    - `readArtifact<T>(dir: string, filename: string)`: 读取并解析 JSON 文件，返回 typed 对象
    - `fileExists(filePath: string)`: 检查文件是否存在
    - `killOrphanedOpenCodeServers()`: 在 afterAll 中调用，查找并终止残留的 `opencode serve` 进程
    - `preflightChecks()`: beforeAll 中运行，检查：
      1. `which opencode` 可执行（否则 skip 全部测试）
      2. `dist/cli/main.js` 存在（否则 skip，提示 `npm run build`）
      3. 运行 `inspect -d {projectDir} --recent 1`，检查 **stdout 不包含 "No OpenCode sessions found"**（注意：inspect 即使无会话也返回 exit code 0，所以必须检查 stdout 内容而非 exit code）
    - `getProjectDir()`: 返回 `process.cwd()` 作为测试用的项目目录
    - `loadDotEnv()`: 读取项目根目录的 `.env` 文件，解析 `KEY=VALUE` 格式（支持引号包裹），返回 `Record<string, string>`。**关键映射逻辑**：
      - `Zhipu_coding_plan_BaseUrl` → `SESSION2SKILLS_LLM_BASE_URL`
      - `Zhipu_coding_plan_apikey` → `SESSION2SKILLS_LLM_API_KEY`
      - 硬编码 `SESSION2SKILLS_LLM_MODEL` = `"glm-5"`
      - `SESSION2SKILLS_LLM_PROVIDER` = `"zhipuai"`
    - `getHybridEnv()`: 调用 `loadDotEnv()` 并返回映射后的环境变量对象，供 Hybrid 测试的 `runCLI` 使用
  - 在 `package.json` 的 scripts 中添加 `"test:e2e": "vitest run tests/e2e/ --pool=forks --poolOptions.forks.singleFork=true"`（单 fork 模式确保串行执行，避免 OpenCode server 端口冲突）
  - 所有 helper 函数只使用 Node.js 内置模块（child_process, node:fs/promises, node:os, node:path, node:fs）

  **Must NOT do**:
  - 不添加任何 npm 依赖（包括 dotenv 包）
  - 不创建 vitest.config.ts
  - 不修改 src/ 中任何文件
  - 不使用 mock LLM server（使用真实 GLM API）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 基础设施代码，模式清晰，无复杂业务逻辑
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - 无 — 纯 Node.js 基础代码

  **Parallelization**:
  - **Can Run In Parallel**: N/A (Wave 1 only task)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `tests/staged-directory-write.test.ts` — 参考其 `mkdtemp` 临时目录创建模式和 `rm` 清理模式

  **API/Type References** (contracts to implement against):
  - `src/cli/main.ts` — CLI 入口点，了解命令注册和参数结构
  - `src/cli/commands/inspect.ts` — inspect 命令的 --directory 和 --recent 参数
  - `src/cli/commands/analyze.ts` — analyze 命令，读取 `process.env.SESSION2SKILLS_LLM_BASE_URL` 等
  - `src/cli/commands/generate.ts` — generate 命令，同样读取 LLM 环境变量
  - `src/shared/errors.ts` — CliUsageError, OpenCodeAdapterError, LlmProviderError 错误类型
  - `.env` — 当前包含 `Zhipu_coding_plan_BaseUrl` 和 `Zhipu_coding_plan_apikey` 两个变量

  **External References**:
  - Node.js `child_process.spawnSync` API: 用于同步执行 CLI 命令并捕获输出

  **WHY Each Reference Matters**:
  - `staged-directory-write.test.ts` 的 tmpdir 模式是经过验证的，直接复用
  - CLI commands 定义了 runCLI 需要传递的完整参数列表
  - analyze.ts 和 generate.ts 中 `process.env.SESSION2SKILLS_LLM_*` 是 .env 映射的目标变量名
  - errors.ts 定义了错误场景测试中需要匹配的错误消息格式
  - .env 中的实际变量名（Zhipu_coding_plan_*）需要映射为 CLI 期望的 SESSION2SKILLS_LLM_* 格式

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: helpers.ts 文件创建成功且导出正确函数
    Tool: Bash
    Preconditions: tests/e2e/ 目录已创建
    Steps:
      1. 运行 `ls tests/e2e/helpers.ts` 验证文件存在
      2. 检查文件中 export 的函数名包含 runCLI, createTempDir, cleanupDir, readArtifact, fileExists, killOrphanedOpenCodeServers, preflightChecks, getProjectDir, loadDotEnv, getHybridEnv
    Expected Result: helpers.ts 存在，且导出所有 10 个函数
    Failure Indicators: 文件不存在，或缺少任何导出函数
    Evidence: .sisyphus/evidence/task-1-helpers-exports.txt

  Scenario: package.json 包含 test:e2e 脚本（含串行配置）
    Tool: Bash
    Preconditions: package.json 已更新
    Steps:
      1. 运行 `node -e "const p = require('./package.json'); console.log(p.scripts['test:e2e'])"`
    Expected Result: 输出包含 "vitest run tests/e2e/" 和串行参数（"--pool=forks" 或 "singleFork"）
    Failure Indicators: undefined 或缺少串行配置
    Evidence: .sisyphus/evidence/task-1-package-script.txt

  Scenario: loadDotEnv 正确解析 .env 并映射环境变量
    Tool: Bash
    Preconditions: .env 文件包含 Zhipu_coding_plan_BaseUrl 和 Zhipu_coding_plan_apikey
    Steps:
      1. 用 node 执行 loadDotEnv() 并打印结果
      2. 验证返回对象包含 SESSION2SKILLS_LLM_BASE_URL（值来自 Zhipu_coding_plan_BaseUrl，去掉引号）
      3. 验证返回对象包含 SESSION2SKILLS_LLM_API_KEY（值来自 Zhipu_coding_plan_apikey，去掉引号）
      4. 验证 SESSION2SKILLS_LLM_MODEL 为 "glm-5"
      5. 验证 SESSION2SKILLS_LLM_PROVIDER 为 "zhipuai"
    Expected Result: 4 个环境变量正确映射，BASE_URL 值为 "https://open.bigmodel.cn/api/coding/paas/v4"
    Failure Indicators: 变量名错误、值包含引号、映射缺失
    Evidence: .sisyphus/evidence/task-1-env-mapping.txt

  Scenario: getHybridEnv 返回可直接传入 runCLI 的 env 对象
    Tool: Bash
    Steps:
      1. 调用 getHybridEnv()
      2. 验证返回的对象包含所有 SESSION2SKILLS_LLM_* 变量
      3. 验证 BASE_URL 可以被 curl 访问（或至少格式正确为 http(s)://...）
    Expected Result: env 对象可被 runCLI 的 spawnSync 直接使用
    Evidence: .sisyphus/evidence/task-1-hybrid-env.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add helpers, pre-flight checks, and .env mapping`
  - Files: `tests/e2e/helpers.ts`, `package.json`
  - Pre-commit: `npm run typecheck`

- [x] 2. Inspect 命令测试 — tests/e2e/inspect.test.ts

  **What to do**:
  - 创建 `tests/e2e/inspect.test.ts`
  - 使用 `describe("inspect command")` 组织测试
  - 在 `beforeAll` 中调用 `preflightChecks()`
  - 在 `afterAll` 中调用 `killOrphanedOpenCodeServers()`
  - 测试用例：
    1. **正常列出会话**: `runCLI(["inspect", "-d", projectDir, "--recent", "3"])` → exit code 0, stdout 非空，包含表头（ID/Title/Date 等列），至少一行数据
    2. **--recent 限制数量**: `--recent 1` → 输出只有 1 行数据（不含表头）
    3. **无效目录**: `--directory /nonexistent/path` → exit code 1, stderr 包含错误信息
    4. **不传 --directory 时使用默认 cwd**: `runCLI(["inspect", "--recent", "1"])` → exit code 0（`resolveProjectDirectory` 回退到 `process.cwd()`，不报错）

  **Must NOT do**:
  - 不依赖特定会话内容（只验证输出格式和行数）
  - 不解析 stdout 为结构化数据（inspect 输出是 tab-separated 文本，只验证非空和格式概要）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: CLI E2E 测试，需要理解 CLI 命令参数和输出格式
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `tests/e2e/helpers.ts` (Task 1 产出) — runCLI, preflightChecks, getProjectDir 用法

  **API/Type References**:
  - `src/cli/commands/inspect.ts` — inspect 命令完整参数定义和输出格式
  - `src/adapters/opencode/sessions.ts` — 了解 inspect 底层如何获取会话列表

  **WHY Each Reference Matters**:
  - inspect.ts 定义了 --directory 和 --recent 参数的验证逻辑
  - sessions.ts 帮助理解输出格式和列顺序

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: inspect 正常列出会话
    Tool: Bash
    Preconditions: opencode 可用，项目有会话数据
    Steps:
      1. 运行 `node dist/cli/main.js inspect -d /Users/suyingke/Programs/OHO/session2skills --recent 3`
      2. 检查 exit code 为 0
      3. 检查 stdout 非空
      4. 检查 stdout 包含表头行（ID, Title 或类似列名）
    Expected Result: exit code 0, stdout 包含至少 1 行表头 + 1 行数据
    Failure Indicators: exit code 非 0, stdout 为空
    Evidence: .sisyphus/evidence/task-2-inspect-normal.txt

  Scenario: inspect 无效目录报错
    Tool: Bash
    Steps:
      1. 运行 `node dist/cli/main.js inspect -d /nonexistent/path --recent 1`
      2. 检查 exit code 为 1
      3. 检查 stderr 包含错误信息
    Expected Result: exit code 1, stderr 非空
    Evidence: .sisyphus/evidence/task-2-inspect-invalid-dir.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add inspect command tests`
  - Files: `tests/e2e/inspect.test.ts`
  - Pre-commit: `npx vitest run tests/e2e/inspect.test.ts`

- [x] 3. Analyze Legacy 模式测试 — tests/e2e/analyze-legacy.test.ts

  **What to do**:
  - 创建 `tests/e2e/analyze-legacy.test.ts`
  - 使用 `describe("analyze legacy")` 组织
  - beforeAll: preflightChecks()
  - afterAll: killOrphanedOpenCodeServers()
  - afterEach: cleanupDir(当前测试的 tempDir)
  - 测试用例：
    1. **正常分析**: `runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir])` → exit code 0
    2. **验证 normalized.json**: 存在，是数组，每个元素有 id/messages/evidence 属性
    3. **验证 profile.json**: 存在，有 workStyle/communicationStyle/validationHabits/constraints/confidenceNotes 属性
    4. **--force 覆盖已有目录**: 先运行一次，再带 --force 运行 → exit code 0，文件已更新
    5. **不使用 --force 时拒绝覆盖**: 先运行一次，再不带 --force 运行 → exit code 1, stderr 包含 "Refusing to overwrite"

  **Must NOT do**:
  - 不验证具体的 workStyle 或 claim 值（依赖会话内容，不确定）
  - 只验证 artifact 文件的结构和必需字段存在

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解 analyze 命令的完整输出 artifact 结构
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `tests/e2e/helpers.ts` (Task 1) — runCLI, createTempDir, cleanupDir, readArtifact 用法

  **API/Type References**:
  - `src/cli/commands/analyze.ts` — analyze 命令参数：--directory, --recent, --out, --tone, --force, --hybrid
  - `src/normalize/models.ts` — NormalizedSession 类型（id, messages, evidence 等字段）
  - `src/persist/run-store.ts` — 了解 analyze 写入哪些文件（normalized.json, profile.json）
  - `src/shared/errors.ts` — CliUsageError（用于验证 "Refusing to overwrite" 错误消息）

  **WHY Each Reference Matters**:
  - models.ts 定义了 normalized.json 和 profile.json 的 schema，测试需验证这些字段
  - run-store.ts 列出了 analyze 命令实际写入的文件清单
  - errors.ts 帮助构建 --force 错误场景的断言

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: analyze legacy 正常运行并产出所有 artifact
    Tool: Bash
    Preconditions: opencode 可用，项目有会话
    Steps:
      1. 运行 `node dist/cli/main.js analyze -d {projectDir} --recent 3 -o {tempDir}`
      2. 检查 exit code 为 0
      3. 检查 {tempDir}/normalized.json 存在
      4. 检查 {tempDir}/profile.json 存在
      5. 解析 normalized.json → 验证是数组，元素有 id 属性
      6. 解析 profile.json → 验证有 workStyle, communicationStyle, validationHabits, constraints, confidenceNotes 属性
    Expected Result: exit code 0, 两个文件存在且 schema 正确
    Failure Indicators: 文件缺失，JSON 解析失败，缺少必需字段
    Evidence: .sisyphus/evidence/task-3-analyze-legacy-artifacts.txt

  Scenario: 不使用 --force 时拒绝覆盖已有输出目录
    Tool: Bash
    Steps:
      1. 运行 analyze 成功一次（得到输出目录）
      2. 再次运行同样命令（不带 --force）
      3. 检查 exit code 为 1
      4. 检查 stderr 包含 "overwrite" 或 "Refusing"
    Expected Result: exit code 1, stderr 包含拒绝覆盖的错误信息
    Evidence: .sisyphus/evidence/task-3-analyze-no-force.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add analyze legacy tests`
  - Files: `tests/e2e/analyze-legacy.test.ts`
  - Pre-commit: `npx vitest run tests/e2e/analyze-legacy.test.ts`

- [x] 4. Analyze Hybrid 模式测试 — tests/e2e/analyze-hybrid.test.ts

  **What to do**:
  - 创建 `tests/e2e/analyze-hybrid.test.ts`
  - 使用 `describe("analyze hybrid")` 组织
  - beforeAll: preflightChecks() + 从 helpers 获取 `getHybridEnv()` 的返回值
  - afterAll: killOrphanedOpenCodeServers()
  - afterEach: cleanupDir(tempDir)
  - 测试用例：
    1. **正常 hybrid 分析（真实 LLM API）**: `runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir, "--hybrid"], { env: hybridEnv })` → exit code 0
       - **注意**: 使用真实 GLM API，timeout 设为 120000ms（LLM 调用可能较慢）
    2. **验证完整 artifact 树**: 验证以下文件都存在且有正确 schema（基于 `src/normalize/models.ts` 中的真实类型定义）：
       - `normalized.json` — 数组，每个元素有 id/title/directory/messages/toolInvocations
       - `profile.json` — 有 schemaVersion: "profile/v2", strongestSignals (Record), acceptedClaims (Array), tentativeClaims (Array), mergedClaims (Array), confidenceNotes (Array)
       - `evidence-index.json` — 数组，每个元素有 evidenceID/citation/summaryText/dimensions
       - `rule-claims.json` — 数组，每个元素有 claimID/dimension/label/confidence/citations/source
       - `llm-session-claims.json` — 数组，每个元素有 claimID/dimension/label/confidence/citations/source
       - `llm-category-claims.json` — 数组
       - `merged-claims.json` — 数组，每个元素有 claimID/dimension/label/confidence/citations/sources
       - `skill-plan.json` — 有 schemaVersion/planID/title/sections (Array)/directives (Record)
       - `llm-traces.json` — 数组，每个元素有 traceID/stage/provider/model/request/response/usage，其中 usage 字段为 `{ inputTokens?: number, outputTokens?: number, totalTokens?: number }`
       - `manifest.json` — 有 schemaVersion/runID/generatedAt/directory/sessionIDs/artifacts (Array)，以及 metadata.mode === "hybrid"
    3. **LLM traces 包含真实调用记录**: 验证 llm-traces.json 非空，每个 trace 有真实的 token usage（`usage.inputTokens > 0`）
    4. **LLM 缺失必要环境变量**: 不传 SESSION2SKILLS_LLM_BASE_URL → exit code 1, stderr 包含错误信息
    5. **manifest 验证**: 验证 manifest.json 包含 `metadata.mode === "hybrid"`, 正确的 schema 版本号（`schemaVersion: "run-manifest/v1"`）
    6. **验证 claims 来自真实 LLM**: merged-claims.json 中至少有一个 claim 的 `sources` 数组中包含 `type: "llm-session"` 或 `type: "llm-category"` 的 source

  **Must NOT do**:
  - 不使用 mock LLM — 全部使用真实 GLM API
  - 不验证 claims 的精确内容（LLM 输出非确定性，只验证结构）
  - 不对 LLM 响应质量做断言

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Hybrid 模式 artifact 结构最复杂（10+ 文件），需要仔细验证每个文件的 schema，且需要处理真实 LLM API 的非确定性
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `tests/e2e/helpers.ts` (Task 1) — runCLI, createTempDir, readArtifact, getHybridEnv
  - `tests/fixtures/sample-hybrid-artifacts.ts` — 参考其 merged claims 结构

  **API/Type References**:
  - `src/cli/commands/analyze.ts` — --hybrid 参数处理逻辑，读取 `process.env.SESSION2SKILLS_LLM_*`
  - `src/normalize/models.ts` — 所有 artifact 类型定义（ProfileV2, EvidenceItem, MergedClaim, SkillPlan, LLMTrace, RunManifest）
  - `src/persist/run-store.ts` — hybrid 模式写入的完整文件清单
  - `docs/hybrid-artifacts.md` — 每个 artifact 文件的详细说明和 schema
  - `src/llm/openai-compatible.ts` — 了解 LLM 调用如何映射到 GLM API

  **WHY Each Reference Matters**:
  - models.ts 是 schema 验证的权威来源 — 测试断言必须匹配这些类型
  - run-store.ts 列出了所有需要验证存在性的文件
  - hybrid-artifacts.md 提供了每个文件的人类可读说明
  - sample-hybrid-artifacts.ts 提供了实际的 merged claims 示例结构
  - openai-compatible.ts 帮助理解 GLM API 调用路径和响应格式

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: analyze hybrid 产出完整 artifact 树（10 个文件）— 使用真实 GLM API
    Tool: Bash
    Preconditions: .env 配置有效，opencode 可用
    Steps:
      1. 运行 `node dist/cli/main.js analyze -d {projectDir} --recent 3 -o {tempDir} --hybrid`（传入从 .env 映射的 LLM env）
      2. 检查 exit code 为 0
      3. 检查以下 10 个文件全部存在：normalized.json, profile.json, evidence-index.json, rule-claims.json, llm-session-claims.json, llm-category-claims.json, merged-claims.json, skill-plan.json, llm-traces.json, manifest.json
      4. 解析每个 JSON 文件并验证顶层字段
      5. 验证 llm-traces.json 的 `usage.inputTokens > 0`（证明真实 API 调用）
      6. 验证 merged-claims.json 至少有 1 个 claim 的 `sources[].source.type` 包含 `"llm-session"` 或 `"llm-category"`
    Expected Result: exit code 0, 10 个文件全部存在，LLM traces 证明有真实 API 调用
    Failure Indicators: 任何文件缺失、JSON 解析失败、llm-traces 为空或 prompt_tokens 为 0
    Evidence: .sisyphus/evidence/task-4-hybrid-artifact-tree.txt

  Scenario: 缺少 LLM 环境变量时 hybrid 模式报错
    Tool: Bash
    Steps:
      1. 运行 `node dist/cli/main.js analyze -d {projectDir} --recent 1 -o {tempDir} --hybrid`（不传 LLM env）
      2. 检查 exit code 为 1
      3. 检查 stderr 包含 "SESSION2SKILLS_LLM_BASE_URL" 或 "Hybrid mode requires"
    Expected Result: exit code 1, stderr 包含缺少环境变量的提示
    Evidence: .sisyphus/evidence/task-4-hybrid-missing-env.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add analyze hybrid tests (real LLM API)`
  - Files: `tests/e2e/analyze-hybrid.test.ts`
  - Pre-commit: `npx vitest run tests/e2e/analyze-hybrid.test.ts`

- [x] 5. Generate Legacy 模式测试 — tests/e2e/generate-legacy.test.ts

  **What to do**:
  - 创建 `tests/e2e/generate-legacy.test.ts`
  - 使用 `describe("generate legacy")` 组织
  - beforeAll: preflightChecks()
  - afterAll: killOrphanedOpenCodeServers()
  - afterEach: cleanupDir(tempDir)
  - 测试用例：
    1. **正常 generate**: `runCLI(["generate", "-d", projectDir, "--recent", "3", "--output", tempDir, "--tone", "balanced"])` → exit code 0
    2. **验证 summary.md**: 存在，非空，以 `#` 开头（是 markdown），包含 "Workflow" 或 "Communication" 或 "Validation" 相关章节标题
    3. **验证 SKILL.md**: 存在，非空，以 `#` 开头，包含项目名称或 "Personalized" 或 "Skill" 关键字
    4. **--force 覆盖**: 第二次 generate 同目录，带 --force → exit code 0
    5. **不使用 --force 时拒绝覆盖**: 不带 --force 重复 generate → exit code 1

  **Must NOT do**:
  - 不检查 SKILL.md 的精确内容（依赖会话数据）
  - 不运行 analyze 命令（generate 命令内部会自动运行 analyze）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解 generate 命令的完整流程和输出验证
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `tests/e2e/helpers.ts` (Task 1)
  - `tests/golden/SKILL.md` — 参考其结构了解 SKILL.md 应有的格式（但不做精确匹配）
  - `tests/golden/summary.md` — 参考其结构了解 summary.md 格式

  **API/Type References**:
  - `src/cli/commands/generate.ts` — generate 命令参数：--output, --profile, --hybrid, --tone, --force
  - `src/generate/render-skill.ts` — 了解 SKILL.md 渲染逻辑
  - `src/generate/render-summary.ts` — 了解 summary.md 渲染逻辑

  **WHY Each Reference Matters**:
  - golden files 提供了输出格式的参考，帮助构建合理的结构验证断言
  - generate.ts 定义了 --output 和 --force 的行为
  - render-skill.ts 和 render-summary.ts 帮助了解输出的章节结构

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: generate legacy 产出 summary.md 和 SKILL.md
    Tool: Bash
    Preconditions: opencode 可用，项目有会话
    Steps:
      1. 运行 `node dist/cli/main.js generate -d {projectDir} --recent 3 --output {tempDir} --tone balanced`
      2. 检查 exit code 为 0
      3. 检查 {tempDir}/summary.md 存在且非空
      4. 检查 {tempDir}/SKILL.md 存在且非空
      5. 读取 SKILL.md 前 5 行，验证包含 markdown 标题
    Expected Result: 两个文件存在，SKILL.md 和 summary.md 都是合法 markdown
    Failure Indicators: 文件缺失或为空，不是 markdown 格式
    Evidence: .sisyphus/evidence/task-5-generate-legacy-output.txt

  Scenario: --force 允许覆盖已有输出
    Tool: Bash
    Steps:
      1. 运行 generate 成功一次
      2. 再次运行 generate --force 到同目录
      3. 检查 exit code 为 0
      4. 验证文件已更新（对比 modification time 或内容 hash）
    Expected Result: 第二次运行成功，文件已更新
    Evidence: .sisyphus/evidence/task-5-generate-force.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add generate legacy tests`
  - Files: `tests/e2e/generate-legacy.test.ts`
  - Pre-commit: `npx vitest run tests/e2e/generate-legacy.test.ts`

- [x] 6. Generate Hybrid 模式测试 — tests/e2e/generate-hybrid.test.ts

  **What to do**:
  - 创建 `tests/e2e/generate-hybrid.test.ts`
  - 使用 `describe("generate hybrid")` 组织
  - beforeAll: preflightChecks() + getHybridEnv()
  - afterAll: killOrphanedOpenCodeServers()
  - afterEach: cleanupDir(tempDir)
  - 测试用例：
    1. **正常 hybrid generate（真实 LLM API）**: `runCLI(["generate", "-d", projectDir, "--recent", "3", "--output", tempDir, "--hybrid", "--tone", "balanced"], { env: hybridEnv })` → exit code 0
       - **注意**: timeout 设为 120000ms（LLM 调用可能较慢）
    2. **验证完整输出**: 检查以下文件存在且合法：
       - `summary.md` — 非空，markdown 格式，包含 evidence excerpts 或 "Strongest signals"
       - `SKILL.md` — 非空，markdown 格式
       - `merged-claims.json` — 数组（`MergedClaim[]`），每个元素有 claimID/dimension/label/confidence/citations/sources（注意：MergedClaim 没有 `status` 字段，status 只存在于 `toRankedMergedClaim` 的中间格式中）
       - `skill-plan.json` — 有 sections/directives
    3. **SKILL.md 结构验证**: 包含 "workflow" 或 "communication" 或 "validation" 相关章节
    4. **验证 LLM 真实参与（可观察信号）**: CLI 在 stdout 中输出 JSON，其中包含 `skillRenderer` 字段。断言 `"skillRenderer": "llm"` 而非 `"fallback"`，这是代码中确定性的可观察信号（见 `src/cli/commands/generate.ts:79,89` 的输出格式）。不需要主观判断 SKILL.md 的文风。
    5. **缺少 LLM 环境变量**: 不传 env → exit code 1

  **Must NOT do**:
  - 不验证 SKILL.md 的具体指令内容（LLM 输出非确定性）
  - 不使用 mock LLM — 全部使用真实 GLM API

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解 hybrid generate 的多文件输出，且需要处理真实 LLM API 的非确定性
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 7)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `tests/e2e/analyze-hybrid.test.ts` (Task 4) — 复用 hybrid env 设置模式
  - `tests/golden/SKILL-hybrid.md` — 参考 hybrid SKILL.md 的结构

  **API/Type References**:
  - `src/cli/commands/generate.ts` — --hybrid 参数的处理逻辑
  - `src/generate/composer.ts` — LLM skill 组合器，了解 hybrid SKILL.md 的生成方式
  - `src/generate/render-skill.ts` — hybrid 渲染路径选择逻辑
  - `src/persist/generated-artifacts.ts` — hybrid generate 写入的文件列表

  **WHY Each Reference Matters**:
  - SKILL-hybrid.md golden file 提供了 hybrid 输出结构的参考
  - composer.ts 帮助理解真实 LLM 如何参与 SKILL.md 生成
  - generated-artifacts.ts 列出了 generate --hybrid 实际写入的文件

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: generate hybrid 产出所有文件 — 使用真实 GLM API
    Tool: Bash
    Preconditions: .env 配置有效，opencode 可用
    Steps:
      1. 运行 `node dist/cli/main.js generate -d {projectDir} --recent 3 --output {tempDir} --hybrid --tone balanced`（传入 hybrid env）
      2. 检查 exit code 为 0
      3. 检查 summary.md, SKILL.md, merged-claims.json, skill-plan.json 存在
      4. 验证 SKILL.md 非空且包含 markdown 标题
      5. 验证 merged-claims.json 是数组，元素有 claimID/dimension/label/confidence/citations/sources（无 status 字段）
      6. 验证 skill-plan.json 有 sections 属性
      7. 解析 CLI stdout 中的 JSON 输出，断言 `"skillRenderer": "llm"`（非 `"fallback"`），这是确定性可观察信号
    Expected Result: 4 个文件全部存在，schema 正确，CLI 报告 skillRenderer 为 "llm"
    Failure Indicators: 文件缺失，JSON 解析失败，SKILL.md 为空，skillRenderer 为 "fallback"
    Evidence: .sisyphus/evidence/task-6-generate-hybrid-output.txt

  Scenario: 缺少 LLM 环境变量时 generate --hybrid 报错
    Tool: Bash
    Steps:
      1. 运行 generate --hybrid（不传 LLM env）
      2. 检查 exit code 为 1
      3. 检查 stderr 包含环境变量相关错误
    Expected Result: exit code 1, stderr 有明确错误信息
    Evidence: .sisyphus/evidence/task-6-generate-hybrid-no-env.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add generate hybrid tests (real LLM API)`
  - Files: `tests/e2e/generate-hybrid.test.ts`
  - Pre-commit: `npx vitest run tests/e2e/generate-hybrid.test.ts`

- [x] 7. Generate --profile 测试 — tests/e2e/generate-profile.test.ts

  **What to do**:
  - 创建 `tests/e2e/generate-profile.test.ts`
  - 使用 `describe("generate --profile")` 组织
  - beforeAll: preflightChecks() + 准备 v1 和 v2 profile 文件（通过运行 analyze legacy 和 analyze hybrid）
  - afterAll: killOrphanedOpenCodeServers() + cleanupDir(analysisDir)
  - afterEach: cleanupDir(tempDir)
  - 测试用例：
    1. **从 v1 profile generate**: 先运行 analyze legacy 得到 profile.json，再用 `runCLI(["generate", "--profile", profilePath, "--output", tempDir, "--tone", "balanced"])` → exit code 0，产出 summary.md + SKILL.md
    2. **从 v2 profile generate（真实 LLM 交互）**: 先运行 analyze hybrid 得到 profile/v2 profile，再用 `--profile` → exit code 0，自动检测 v2 并走 hybrid 路径
       - **注意**: v2 profile generate 可能也需要 LLM 调用（用于 composer），传入 hybridEnv，timeout 120000ms
    3. **无效 profile 路径**: 传入不存在的文件路径 → exit code 1, stderr 包含错误
    4. **v2 profile 自动使用 sibling artifacts**: `findSiblingArtifact()` 会在 profile.json 同目录查找 `skill-plan.json`。验证方式：先运行 analyze hybrid 得到输出目录，修改其中的 `skill-plan.json` 的 `planID` 为 `"e2e-sentinel-reused"`，然后用 `--profile {该目录}/profile.json` 运行 generate，检查输出的 generate 目录中的 `skill-plan.json` 是否保留了 sentinel `planID`。如果保留了，说明复用成功；如果 planID 不同，说明重新计算了。
       - 注意：generate 的 `--profile` 只支持文件路径（不支持目录），传入目录路径会被 `loadProfileFromFile()` 当文件读取导致报错。

  **Must NOT do**:
  - 不测试 profile 内容的精确匹配
  - 不测试跨版本兼容性的所有组合
  - 不 mock LLM — v2 profile generate 使用真实 API

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解 --profile 参数的自动检测逻辑、v1/v2 区分、以及真实 LLM 在 v2 路径中的参与
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `tests/e2e/analyze-legacy.test.ts` (Task 3) — 复用 analyze 产出 profile 的模式
  - `tests/e2e/analyze-hybrid.test.ts` (Task 4) — 复用 hybrid 分析模式
  - `tests/fixtures/sample-profile.ts` — v1 profile 结构参考
  - `tests/fixtures/sample-profile-v2.ts` — v2 profile 结构参考

  **API/Type References**:
  - `src/cli/commands/generate.ts` — --profile 参数处理，文件路径 vs 目录路径，v1/v2 自动检测
  - `src/shared/profile-io.ts` — profile 文件加载和 schemaVersion 检测逻辑
  - `src/profile/profile-v2.ts` — ProfileV2 的 schemaVersion: "profile/v2" 标识

  **WHY Each Reference Matters**:
  - generate.ts 的 --profile 处理是最复杂的逻辑，理解其行为是设计测试的关键
  - profile-io.ts 定义了 profile 加载和验证逻辑
  - sample fixtures 提供了 v1/v2 profile 的结构参考

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 从 v1 profile generate 产出 summary.md 和 SKILL.md
    Tool: Bash
    Steps:
      1. 先运行 analyze legacy 得到 profile.json
      2. 运行 `node dist/cli/main.js generate --profile {profile.json path} --output {tempDir} --tone balanced`
      3. 检查 exit code 为 0
      4. 检查 summary.md 和 SKILL.md 存在且非空
    Expected Result: exit code 0, 两个文件存在
    Evidence: .sisyphus/evidence/task-7-profile-v1.txt

  Scenario: 从 v2 profile generate 自动走 hybrid 路径 — 真实 LLM
    Tool: Bash
    Steps:
      1. 先运行 analyze hybrid 得到输出目录（内含 profile.json, skill-plan.json, merged-claims.json 等）
      2. 修改 `{analyze输出目录}/skill-plan.json` 的 `planID` 为 `"e2e-sentinel-reused"`
      3. 运行 `node dist/cli/main.js generate --profile {analyze输出目录}/profile.json --output {tempDir} --tone balanced`（传入 hybridEnv）
      4. 检查 exit code 为 0
      5. 验证输出包含 summary.md 和 SKILL.md
      6. 检查 CLI stdout JSON 输出中 `skillRenderer` 字段为 `"llm"`
    Expected Result: exit code 0, hybrid artifacts 存在，skillRenderer 为 "llm"
    Evidence: .sisyphus/evidence/task-7-profile-v2.txt

  Scenario: sibling skill-plan.json 被 findSiblingArtifact 复用（sentinel 验证）
    Tool: Bash
    Steps:
      1. 基于上面的 analyze hybrid 输出目录（skill-plan.json 已被修改 planID 为 "e2e-sentinel-reused"）
      2. 运行 `node dist/cli/main.js generate --profile {analyze输出目录}/profile.json --output {tempDir2} --tone balanced`
      3. 读取输出目录的 `skill-plan.json`
      4. 断言 `planID === "e2e-sentinel-reused"`（证明复用了被修改的 sibling，而非重新计算）
    Expected Result: 输出的 skill-plan.json 保留了 sentinel planID
    Evidence: .sisyphus/evidence/task-7-sibling-reuse.txt

  Scenario: 无效 profile 路径报错
    Tool: Bash
    Steps:
      1. 运行 `node dist/cli/main.js generate --profile /nonexistent/profile.json --output {tempDir}`
      2. 检查 exit code 为 1
      3. 检查 stderr 非空
    Expected Result: exit code 1, stderr 包含错误信息
    Evidence: .sisyphus/evidence/task-7-profile-invalid.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add generate --profile tests`
  - Files: `tests/e2e/generate-profile.test.ts`
  - Pre-commit: `npx vitest run tests/e2e/generate-profile.test.ts`

- [x] 8. Tone Presets 测试 — tests/e2e/tone-presets.test.ts

  **What to do**:
  - 创建 `tests/e2e/tone-presets.test.ts`
  - 使用 `describe("tone presets")` 组织
  - beforeAll: preflightChecks()
  - afterAll: killOrphanedOpenCodeServers()
  - afterEach: cleanupDir(tempDir)
  - 测试用例：
    1. **concise tone**: `runCLI(["generate", "-d", projectDir, "--recent", "3", "--output", tempDir1, "--tone", "concise"])` → exit code 0, SKILL.md 存在
    2. **balanced tone**: `runCLI(["generate", "-d", projectDir, "--recent", "3", "--output", tempDir2, "--tone", "balanced"])` → exit code 0
    3. **detailed tone**: `runCLI(["generate", "-d", projectDir, "--recent", "3", "--output", tempDir3, "--tone", "detailed"])` → exit code 0
    4. **对比三种 tone 的 summary.md 大小**: detailed > balanced > concise（大致趋势，不做精确断言）
    5. **验证每种 tone 的 SKILL.md 都是合法 markdown**: 都包含标题和章节
    6. **无效 tone 值**: `--tone verbose` → exit code 1, stderr 包含允许的 tone 值列表

  **Must NOT do**:
  - 不验证 tone 的精确影响（LLM 输出非确定性）
  - 只验证结构性差异（文件大小趋势）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解 tone 对不同渲染路径的影响
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 9)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Tasks 5, 6

  **References**:

  **Pattern References**:
  - `tests/e2e/helpers.ts` (Task 1) — runCLI, createTempDir
  - `tests/e2e/generate-legacy.test.ts` (Task 5) — 复用 generate 测试模式

  **API/Type References**:
  - `src/shared/cli.ts` — tone preset 验证逻辑（concise/balanced/detailed）
  - `src/generate/render-summary.ts` — tone 如何影响 summary 渲染

  **WHY Each Reference Matters**:
  - cli.ts 定义了 tone 的合法值和错误消息
  - render-summary.ts 展示了 tone 如何影响 evidence excerpt 数量

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 三种 tone 都能正常产出 SKILL.md
    Tool: Bash
    Steps:
      1. 分别运行 generate --tone concise, balanced, detailed
      2. 检查三次都 exit code 0
      3. 检查三个输出目录都有 SKILL.md 和 summary.md
      4. 读取三个 summary.md 的内容长度
      5. 验证 summary_detailed.length >= summary_balanced.length >= summary_concise.length（大致趋势）
    Expected Result: 三次都成功，summary 大小呈现 detailed > balanced > concise 趋势
    Evidence: .sisyphus/evidence/task-8-tone-sizes.txt

  Scenario: 无效 tone 值报错
    Tool: Bash
    Steps:
      1. 运行 `node dist/cli/main.js generate -d {projectDir} --recent 1 --output {tempDir} --tone verbose`
      2. 检查 exit code 为 1
      3. 检查 stderr 包含 "concise" 或 "balanced" 或 "detailed"
    Expected Result: exit code 1, stderr 提示有效的 tone 值
    Evidence: .sisyphus/evidence/task-8-tone-invalid.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add tone preset tests`
  - Files: `tests/e2e/tone-presets.test.ts`
  - Pre-commit: `npx vitest run tests/e2e/tone-presets.test.ts`

- [x] 9. 错误场景测试 — tests/e2e/error-scenarios.test.ts

  **What to do**:
  - 创建 `tests/e2e/error-scenarios.test.ts`
  - 使用 `describe("error scenarios")` 组织
  - beforeAll: preflightChecks()
  - afterAll: killOrphanedOpenCodeServers()
  - afterEach: cleanupDir(tempDir)
  - 测试用例（错误场景，预期均返回 exit code 1）：
    1. **无效项目目录**: `analyze -d /nonexistent/path` → exit code 1, stderr 包含错误
    2. **不存在的 profile 文件路径**: `generate --profile /nonexistent/profile.json --output {tempDir}` → exit code 1
    3. **输出目录已存在且不使用 --force**: 先创建目录，再不带 --force 运行 analyze → exit code 1
    4. **无效命令**: `node dist/cli/main.js unknown-command` → exit code 1, stderr 包含帮助信息
    5. **Hybrid 缺少 LLM 环境变量**: `analyze --hybrid`（不传 LLM env）→ exit code 1
    6. **--hybrid 配合 v1 profile**: `generate --profile {v1_profile.json} --hybrid` → exit code 1, stderr 包含 "requires a hybrid profile/v2"
  - 测试用例（边界场景，非错误）：
    7. **不传 --directory 时使用默认 cwd**: `inspect --recent 1` → exit code 0（回退到 `process.cwd()`，不报错）
    8. **--recent 为 0**: `inspect -d {projectDir} --recent 0` → 验证实际行为（可能为空输出或 exit code 1 由 parsePositiveInteger 拒绝）

  **Must NOT do**:
  - 不测试极端边界条件（磁盘满、权限等）
  - 不测试 OpenCode server 的故障场景

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解每种错误场景的预期行为和错误消息
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 8)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `tests/e2e/inspect.test.ts` (Task 2) — 参考错误场景的断言模式
  - `tests/e2e/analyze-legacy.test.ts` (Task 3) — 参考 --force 错误的断言

  **API/Type References**:
  - `src/shared/errors.ts` — 所有自定义错误类型和消息格式
  - `src/shared/cli.ts` — CLI 参数验证逻辑
  - `src/cli/commands/analyze.ts` — analyze 错误处理路径
  - `src/cli/commands/generate.ts` — generate 错误处理路径

  **WHY Each Reference Matters**:
  - errors.ts 是错误消息的权威来源，断言必须匹配
  - cli.ts 定义了参数验证的错误格式
  - 各命令文件定义了具体的错误路径和消息

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 错误场景都返回 exit code 1 和有意义的错误消息
    Tool: Bash
    Steps:
      1. 逐个运行上述 6 个错误场景（场景 1-6）
      2. 每个场景验证 exit code 为 1
      3. 每个场景验证 stderr 非空且包含有意义的错误描述
      4. 确认没有创建任何输出文件
    Expected Result: 6 个错误场景全部返回 exit code 1, stderr 有明确错误信息
    Evidence: .sisyphus/evidence/task-9-error-scenarios.txt

  Scenario: 边界场景行为符合预期（非错误）
    Tool: Bash
    Steps:
      1. 场景 7: 运行 `inspect --recent 1`（不传 --directory），检查 exit code 为 0
      2. 场景 8: 运行 `inspect -d {projectDir} --recent 0`，记录实际 exit code 和输出
    Expected Result: 场景 7 成功（exit code 0），场景 8 记录实际行为
    Evidence: .sisyphus/evidence/task-9-boundary-scenarios.txt

  Scenario: 错误场景不影响后续测试（测试隔离性）
    Tool: Bash
    Steps:
      1. 运行一个错误场景（如无效目录）
      2. 紧接着运行一个正常场景（如 inspect）
      3. 验证正常场景不受之前错误影响
    Expected Result: 正常场景 exit code 0, 输出正确
    Evidence: .sisyphus/evidence/task-9-error-isolation.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add error scenario tests`
  - Files: `tests/e2e/error-scenarios.test.ts`
  - Pre-commit: `npx vitest run tests/e2e/error-scenarios.test.ts`

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

  **QA Scenarios:**
  ```
  Scenario: Must Have — Hybrid 使用真实 LLM（无 mock server 代码）
    Tool: Bash
    Steps:
      1. 运行 `grep -r "createServer\|MockLLM\|mock.*llm\|mock.*server" tests/e2e/`
      2. 预期无匹配（不使用 mock LLM）
      3. 运行 `grep -r "loadDotEnv\|getHybridEnv\|Zhipu_coding" tests/e2e/`
      4. 预期匹配（使用真实 API + .env 映射）
    Expected Result: 无 mock 代码，有 .env 映射代码
    Evidence: .sisyphus/evidence/f1-no-mock.txt

  Scenario: Must NOT Have — 未修改 src/ 和未添加依赖
    Tool: Bash
    Steps:
      1. 运行 `git diff --name-only src/`
      2. 预期无输出
      3. 运行 `git diff package.json | grep "^+" | grep -v "test:e2e"` 
      4. 预期无新增依赖
    Expected Result: src/ 无改动，无新增 npm 依赖
    Evidence: .sisyphus/evidence/f1-no-src-changes.txt
  ```

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `npm run typecheck`. Review all new files in tests/e2e/ for: `as any`/`@ts-ignore`, empty catches, console.log, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify no new npm dependencies added.
  Output: `Build [PASS/FAIL] | TypeCheck [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

  **QA Scenarios:**
  ```
  Scenario: TypeScript 类型检查通过
    Tool: Bash
    Steps:
      1. 运行 `npm run typecheck`
      2. 检查 exit code 为 0
    Expected Result: 无类型错误
    Evidence: .sisyphus/evidence/f2-typecheck.txt

  Scenario: 无 AI slop 代码模式
    Tool: Bash
    Steps:
      1. 运行 `grep -rn "as any\|@ts-ignore\|console\\.log\|\/\/ TODO\|\/\/ FIXME" tests/e2e/`
      2. 预期无匹配
      3. 运行 `grep -rn "^.*//.*$" tests/e2e/ | wc -l`
      4. 注释行数应少于代码总行数的 15%
    Expected Result: 无 anti-pattern，注释适度
    Evidence: .sisyphus/evidence/f2-clean-code.txt
  ```

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Run `npm run build && npm run test:e2e`. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Verify all tests pass. Test cross-task: analyze output feeds into generate. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

  **QA Scenarios:**
  ```
  Scenario: 全套 E2E 测试通过
    Tool: Bash
    Steps:
      1. 运行 `npm run build`
      2. 运行 `npm run test:e2e`
      3. 检查 exit code 为 0
      4. 检查输出中无 "FAIL" 或 "×" 标记
      5. 检查输出中所有测试都是 "✓" 或 "passed"
    Expected Result: 所有 E2E 测试通过
    Evidence: .sisyphus/evidence/f3-e2e-results.txt

  Scenario: 单元测试 + E2E 测试全部通过（无回归）
    Tool: Bash
    Steps:
      1. 运行 `npx vitest run`
      2. 检查 exit code 为 0
      3. 检查原有 115 个单元测试仍全部通过
    Expected Result: 全部测试通过，无回归
    Evidence: .sisyphus/evidence/f3-full-test-results.txt

  Scenario: 跨任务集成验证 — analyze 产出可直接被 generate --profile 使用
    Tool: Bash
    Steps:
      1. 运行 `node dist/cli/main.js analyze -d {projectDir} --recent 3 -o /tmp/e2e-integration`
      2. 运行 `node dist/cli/main.js generate --profile /tmp/e2e-integration/profile.json --output /tmp/e2e-integration-gen --tone balanced`
      3. 检查两步都 exit code 0
      4. 检查 /tmp/e2e-integration-gen/ 下有 SKILL.md 和 summary.md
      5. 清理 `rm -rf /tmp/e2e-integration /tmp/e2e-integration-gen`
    Expected Result: 跨命令集成流程完整可用
    Evidence: .sisyphus/evidence/f3-integration.txt
  ```

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes in src/ or existing tests/.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

  **QA Scenarios:**
  ```
  Scenario: 所有 9 个实现任务的代码都存在且与 spec 对齐
    Tool: Bash
    Steps:
      1. 验证 `tests/e2e/helpers.ts` 存在
      2. 验证 `tests/e2e/inspect.test.ts` 存在
      3. 验证 `tests/e2e/analyze-legacy.test.ts` 存在
      4. 验证 `tests/e2e/analyze-hybrid.test.ts` 存在
      5. 验证 `tests/e2e/generate-legacy.test.ts` 存在
      6. 验证 `tests/e2e/generate-hybrid.test.ts` 存在
      7. 验证 `tests/e2e/generate-profile.test.ts` 存在
      8. 验证 `tests/e2e/tone-presets.test.ts` 存在
      9. 验证 `tests/e2e/error-scenarios.test.ts` 存在
    Expected Result: 9 个文件全部存在
    Evidence: .sisyphus/evidence/f4-files-exist.txt

  Scenario: 无跨任务污染（Task N 不修改 Task M 的文件）
    Tool: Bash
    Steps:
      1. 运行 `git diff --stat tests/e2e/`
      2. 检查每个测试文件只被一个 commit 修改
      3. 运行 `git diff --name-only | grep -v "tests/e2e\|package.json"`
      4. 检查无 src/ 或其他 tests/ 文件被修改
    Expected Result: 只有 tests/e2e/ 和 package.json 有变更
    Evidence: .sisyphus/evidence/f4-no-contamination.txt
  ```

---

## Commit Strategy

| Commit | Message | Files |
|--------|---------|-------|
| 1 | `test(e2e): add helpers, pre-flight checks, and .env mapping` | `tests/e2e/helpers.ts`, `package.json` |
| 2 | `test(e2e): add inspect command tests` | `tests/e2e/inspect.test.ts` |
| 3 | `test(e2e): add analyze legacy tests` | `tests/e2e/analyze-legacy.test.ts` |
| 4 | `test(e2e): add analyze hybrid tests (real LLM API)` | `tests/e2e/analyze-hybrid.test.ts` |
| 5 | `test(e2e): add generate legacy tests` | `tests/e2e/generate-legacy.test.ts` |
| 6 | `test(e2e): add generate hybrid tests (real LLM API)` | `tests/e2e/generate-hybrid.test.ts` |
| 7 | `test(e2e): add generate --profile tests` | `tests/e2e/generate-profile.test.ts` |
| 8 | `test(e2e): add tone preset tests` | `tests/e2e/tone-presets.test.ts` |
| 9 | `test(e2e): add error scenario tests` | `tests/e2e/error-scenarios.test.ts` |

---

## Success Criteria

### Verification Commands
```bash
npm run build                                                # Expected: 编译成功
npm run test:e2e                                             # Expected: 全部通过（串行执行）
npx vitest run                                               # Expected: 所有测试（单元+E2E）全部通过
npm run typecheck                                            # Expected: 无类型错误
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All E2E tests pass via `npm run test:e2e`
- [ ] No modifications to src/ directory
- [ ] No new npm dependencies
- [ ] No files written outside tests/e2e/ and package.json
- [ ] Pre-flight checks skip gracefully when opencode unavailable
