# OpenCode MVP 实现任务清单

> 目标：实现一个独立 CLI 小工具，读取 OpenCode 历史会话，提炼用户工作习惯，并生成 `summary.md` 与个性化 `SKILL.md`。

---

## 0. 执行原则

### 0.1 MVP 边界
本阶段只做：
- OpenCode
- 历史 session 分析
- CLI
- 本地文件输出

本阶段不做：
- Claude / Codex
- 实时监听
- UI
- 自动写入线上配置
- 长期记忆系统

### 0.2 完成标准
满足以下条件即可视为 MVP 完成：
- 能列出最近 OpenCode sessions
- 能分析最近 N 个 sessions
- 能生成稳定的 profile 数据
- 能输出 `summary.md` 和 `SKILL.md`
- 结果可人工阅读、编辑、重复生成

---

## 1. Git 管理策略

### 1.1 分支策略
建议新建单独功能分支开发：
- 分支名建议：`feat/opencode-mvp`

如果后续需要继续拆子阶段，可用：
- `feat/opencode-session-access`
- `feat/opencode-analysis`
- `feat/opencode-skill-generation`

### 1.2 提交原则
- 每个提交只做一个明确职责
- 代码、测试、必要文档应尽量同提交
- 不要把“adapter + analysis + generator”混在一个 commit
- 每完成一个可验证的小闭环再提交

### 1.3 建议提交边界
建议至少拆成这些提交单元：

1. 项目骨架与 CLI 入口
2. OpenCode session 读取
3. 归一化模型与转换
4. 信号提取逻辑
5. profile 聚合
6. summary / skill 生成
7. 文件写入与覆盖保护
8. 测试与文档补全

### 1.4 每次提交前必须验证
- 相关测试通过
- 至少运行一次对应 CLI 命令
- 修改后的输出符合预期
- 没有把调试产物误提交

### 1.5 PR / 合并前检查
- `inspect` / `analyze` / `generate` 至少各跑通一次
- 示例输出可读
- README 或使用说明存在
- 没有超出 MVP 范围的功能膨胀

---

## 2. 实现阶段总览

按顺序执行 6 个阶段：

1. 项目骨架
2. OpenCode 数据接入
3. 归一化模型
4. 分析与画像
5. 产物生成
6. 打磨与发布准备

---

## 3. Phase 1：项目骨架与 CLI 入口

### 目标
建立可运行的 CLI 工程结构，为后续功能预留清晰分层。

### 任务
- [ ] 初始化 `src/` 目录结构
- [ ] 建立 CLI 主入口 `src/cli/main.ts`
- [ ] 建立命令骨架：
  - [ ] `inspect`
  - [ ] `analyze`
  - [ ] `generate`
- [ ] 建立共享错误处理与路径工具
- [ ] 确定输出目录约定：
  - [ ] `.session2skills/runs/`
  - [ ] `generated-skills/`

### 交付物
- 可执行 CLI 骨架
- 空命令可运行并输出占位信息

### 验证
- [ ] CLI 能正常启动
- [ ] 三个子命令能被识别

### QA 场景
- 命令：
  - `session2skills --help`
  - `session2skills inspect --help`
  - `session2skills analyze --help`
  - `session2skills generate --help`
- 输入准备：无
- 预期结果：
  - 所有命令退出码为 0
  - 帮助文案中能看到子命令与核心参数
  - 未实现逻辑如果仍是占位，也必须返回明确提示而不是抛出未处理异常

### 建议 commit
- `chore: scaffold CLI entrypoints and project structure`

---

## 4. Phase 2：OpenCode 数据接入

### 目标
通过 OpenCode 支持的接口读取 sessions、messages、summary、diff。

### 接口决策（固定实现路径）
MVP 默认使用 OpenCode SDK 路径，不把“接哪条接口”留给实现阶段临场决定：

1. 使用 `@opencode-ai/sdk/v2` 的 `createOpencodeClient(...)`
2. 通过 session 相关能力读取：
   - session list
   - session messages
   - session summarize
   - session diff
3. CLI 参数显式传入：
   - `--directory <path>`：目标项目目录
   - `--workspace <id>`：可选，指定 workspace

实现约束：
- `directory` 必须作为 adapter 的显式输入，不依赖隐式 cwd
- `workspace` 未传时，默认仅按 `directory` 解析
- 只有当 SDK 路径不足时，才考虑 export / fallback 方案

### 任务
- [ ] 实现 OpenCode client 封装
- [ ] 实现 session list 能力
- [ ] 实现单个 session 详情读取
- [ ] 实现 messages 拉取
- [ ] 实现 summary 拉取（如果可用）
- [ ] 实现 diff 拉取（如果可用）
- [ ] 统一错误处理：
  - [ ] 无 session
  - [ ] session 读取失败
  - [ ] 部分字段缺失

### CLI 对应
- [ ] `session2skills inspect --recent N`

### 交付物
- `src/adapters/opencode/` 下基础访问层
- `inspect` 命令可列出最近 sessions

### 验证
- [ ] 至少能列出最近 5 个真实 session
- [ ] 至少能读取其中 1 个 session 的 messages
- [ ] 在数据缺失时给出清晰错误

### QA 场景
- 命令：`session2skills inspect --directory <project-path> --recent 5`
- 输入准备：目标机器上该 `directory` 下已有至少 5 个 OpenCode sessions。
- 预期结果：
  - 命令退出码为 0
  - 终端输出至多 5 条 session 记录
  - 每条记录至少包含 `sessionID`、更新时间
  - 从输出中任选一个 `sessionID`，适配层能继续成功拉取其 messages

### 建议 commit
- `feat: add OpenCode session inspection adapter`

---

## 5. Phase 3：归一化模型与转换

### 目标
把 OpenCode 原始结构转为后续分析可复用的内部模型。

### 任务
- [ ] 定义内部模型：
  - [ ] `NormalizedSession`
  - [ ] `NormalizedMessage`
  - [ ] `ToolInvocation`
  - [ ] `WorkflowSignal`
  - [ ] `EvidenceRef`
  - [ ] `PreferenceProfile`
- [ ] 实现 raw -> normalized 转换
- [ ] 保留 provenance / evidence 信息
- [ ] 过滤明显噪音字段
- [ ] 为后续多工具扩展保留 adapter 边界

### CLI 对应
- [ ] `analyze` 命令内部使用 normalized 数据

### 交付物
- `src/normalize/` 模块
- 可输出 normalized JSON 调试产物

### 验证
- [ ] 3~5 个真实 sessions 可稳定 normalize
- [ ] 同一输入重复运行结果结构一致
- [ ] evidence 字段不为空

### QA 场景
- 命令：`session2skills analyze --directory <project-path> --recent 5 --out .session2skills/runs/test-normalize`
- 输入准备：使用与 Phase 2 相同的 5 个 sessions。
- 预期结果：
  - 命令退出码为 0
  - 输出目录下存在 normalized 调试产物（如 `normalized.json`）
  - 每个 session 都被成功映射到 `NormalizedSession`
  - `evidence` 字段存在且非空
  - 同一输入重复运行两次时，输出结构和字段集合保持一致

### 建议 commit
- `feat: add normalized session models and mapping`

---

## 6. Phase 4：信号提取与画像构建

### 目标
从 normalized sessions 中提炼 MVP 所需的四类偏好信号。

### 要提取的四类信号
1. 工作方式
2. 沟通风格
3. 验证习惯
4. 约束偏好

### 任务
- [ ] 实现工作方式提取
  - [ ] analysis-first / implementation-first
  - [ ] iterative / one-shot
- [ ] 实现沟通风格提取
  - [ ] concise / explanatory
  - [ ] directive / consultative
- [ ] 实现验证习惯提取
  - [ ] tests
  - [ ] diagnostics
  - [ ] diff/status checks
- [ ] 实现约束偏好提取
  - [ ] minimal diff
  - [ ] preserve patterns
  - [ ] type safety
  - [ ] avoid destructive actions
- [ ] 聚合为 `PreferenceProfile`
- [ ] 对每类信号附 evidence / confidence

### CLI 对应
- [ ] `session2skills analyze --recent N --out ...`

### 交付物
- `src/analyze/`
- `src/profile/`
- `profile.json`

### 验证
- [ ] profile 至少输出 1 个有效偏好结论
- [ ] 重复运行同一输入，主要结论稳定
- [ ] 没有明显“空泛 AI 套话”

### QA 场景
- 命令：`session2skills analyze --directory <project-path> --recent 5 --out .session2skills/runs/test-profile`
- 输入准备：固定使用同一批 5 个 sessions。
- 预期结果：
  - 命令退出码为 0
  - 输出目录下存在 `profile.json`
  - `profile.json` 至少包含四类信号中的一类非空结果
  - 同一命令重复运行两次时，最高优先级的偏好结论保持一致
  - 结论中包含 evidence 或 confidence，而不是只有空泛描述

### 建议 commit
- `feat: extract workflow signals into preference profile`

---

## 7. Phase 5：summary 与 SKILL 生成

### 目标
把画像转成用户可读、可编辑的输出物。

### 任务
- [ ] 设计 `summary.md` 模板
- [ ] 设计 `SKILL.md` 模板
- [ ] 将 `PreferenceProfile` 映射到文本结构
- [ ] 生成以下内容：
  - [ ] detected habits
  - [ ] recommended workflow
  - [ ] communication preference
  - [ ] validation checklist
  - [ ] constraints / anti-patterns
- [ ] 提供预览输出

### CLI 对应
- [ ] `session2skills generate --recent N --output ...`

### 交付物
- `src/generate/`
- 可生成 markdown 文件

### 验证
- [ ] `summary.md` 可读
- [ ] `SKILL.md` 不空泛，结构完整
- [ ] 预览与最终文件内容一致

### QA 场景
- 命令：`session2skills generate --directory <project-path> --recent 5 --output ./generated-skills/test-skill`
- 输入准备：使用已可稳定分析的同一批 sessions。
- 预期结果：
  - 命令退出码为 0
  - 输出目录下存在 `summary.md` 和 `SKILL.md`
  - `summary.md` 包含 detected habits、validation habits 等核心段落
  - `SKILL.md` 至少包含 workflow、communication、validation、constraints 四类内容
  - CLI 中预览的主要内容与最终落盘内容一致

### 建议 commit
- `feat: generate summary and personalized skill artifacts`

---

## 8. Phase 6：写入层、保护机制与打磨

### 目标
确保输出过程安全、可重复、可发布。

### 任务
- [ ] 实现原子写文件
- [ ] 实现覆盖保护
- [ ] 支持 `--force`
- [ ] 清理调试输出与日志策略
- [ ] 增加 fixture / golden tests
- [ ] 编写 README / usage guide
- [ ] 补充错误提示与帮助文案

### 交付物
- `src/persist/`
- 测试样例
- 基础使用文档

### 验证
- [ ] 无 `--force` 时不会静默覆盖
- [ ] 使用 `--force` 时能稳定重写
- [ ] golden output 可用于回归测试
- [ ] 新开发者可按文档跑通一次完整流程

### QA 场景
- 命令：
  - `session2skills generate --directory <project-path> --recent 5 --output ./generated-skills/test-skill`
  - 再次运行相同命令但不加 `--force`
  - 再次运行相同命令并加 `--force`
  - `npm test` 或项目定义的测试命令
- 输入准备：已有一份生成结果和一组 fixture / golden 测试样本。
- 预期结果：
  - 第二次不带 `--force` 时明确拒绝覆盖，并给出清晰提示
  - 加 `--force` 后可成功重写输出
  - 测试命令退出码为 0
  - README 中的最短使用路径足以让新开发者从 `inspect` 跑到 `generate`

### 建议 commit
- `feat: add safe artifact writing and MVP docs`
- `test: add fixtures and golden output coverage`

---

## 9. 测试任务清单

### 单元测试
- [ ] 信号提取函数测试
- [ ] profile 聚合测试
- [ ] markdown 渲染测试

### Fixture 测试
- [ ] OpenCode session fixture -> normalized output
- [ ] normalized input -> profile output

### Golden 测试
- [ ] `summary.md` golden file
- [ ] `SKILL.md` golden file

### 手工验证
- [ ] `inspect` 在真实 OpenCode 环境可跑通
- [ ] `analyze` 在真实 session 数据上可跑通
- [ ] `generate` 可输出可编辑文件

---

## 10. 推荐开发顺序

严格按以下顺序推进：

1. CLI 骨架
2. OpenCode session access
3. normalization
4. signal extraction
5. profile builder
6. summary renderer
7. skill renderer
8. file writer
9. tests
10. docs

不要先写 skill 模板再倒推数据模型；那样后面会反复返工。

---

## 11. 每阶段完成后的 Git 节点

### 阶段完成后建议执行
- [ ] 自查 diff 是否仍然聚焦单一职责
- [ ] 运行对应验证命令
- [ ] 只提交与该阶段直接相关的文件
- [ ] 更新当前阶段状态记录

### 建议里程碑标签
- `v0.1.0-session-access`
- `v0.2.0-analysis-core`
- `v0.3.0-artifact-generation`
- `v0.4.0-mvp-ready`

---

## 12. 最终上线前检查表

- [ ] 真实 OpenCode 数据上完整跑通一次
- [ ] 输出文件没有明显模板化废话
- [ ] skill 内容能体现真实使用习惯
- [ ] README 足够让别人复现
- [ ] git 历史保持原子、清晰、可 review

---

## 13. 一句话执行指令

如果只按一句话推进这份清单：

> 先打通 OpenCode session access，再稳定 profile 分析，最后生成可编辑 skill 文件，并且每个阶段都独立提交与验证。
