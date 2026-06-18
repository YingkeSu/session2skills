# session2skills

> 🤖 将你的 OpenCode 会话转化为 AI 助手可复用的技能文件

[![GitHub Stars](https://img.shields.io/github/stars/YingkeSu/session2skills?style=social)](https://github.com/YingkeSu/session2skills)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## ✨ 这是什么？

**session2skills** 是一个 CLI 工具，它能：

1. 📖 读取你的本地 OpenCode 会话记录
2. 🔍 分析你的工作模式和习惯
3. 📝 生成 `SKILL.md` 技能文件供 AI 助手复用

核心功能是 **harness 管道** — 一个四阶段 LLM 处理流程：

```
分析师 (Analyst) → 质疑者 (Skeptic) → 撰写者 (Writer) → 验证者 (Verifier)
```

每个输出的声明都基于会话证据，并经过质疑者和验证者的交叉检查。

---

## 🚀 快速开始

### 1. 安装

```bash
# 克隆仓库
git clone https://github.com/YingkeSu/session2skills.git
cd session2skills

# 安装依赖并构建
npm install
npm run build
```

### 2. 前置条件

- ✅ `opencode` CLI 已安装并在 `PATH` 中
- ✅ 项目目录中存在 OpenCode 会话记录

### 3. 配置 LLM 环境变量

```bash
# 必需
export SESSION2SKILLS_LLM_BASE_URL="https://api.example.com/v1"
export SESSION2SKILLS_LLM_MODEL="gpt-4o"

# 可选
export SESSION2SKILLS_LLM_API_KEY="sk-..."
export SESSION2SKILLS_LLM_PROVIDER="openai-compatible"
```

| 变量 | 必需 | 说明 |
|------|------|------|
| `SESSION2SKILLS_LLM_BASE_URL` | ✅ | OpenAI 兼容的 API 基础 URL |
| `SESSION2SKILLS_LLM_MODEL` | ✅ | 模型标识符（如 `gpt-4o`、`claude-3-opus`） |
| `SESSION2SKILLS_LLM_API_KEY` | ❌ | API 密钥，某些本地/自托管端点不需要 |
| `SESSION2SKILLS_LLM_PROVIDER` | ❌ | 提供商标签，默认 `openai-compatible` |
| `SESSION2SKILLS_LLM_MODEL_VERSION` | ❌ | 可选的版本标签 |

---

## 📖 命令指南

### 🔍 检查会话

查看最近的 OpenCode 会话：

```bash
node dist/cli/main.js inspect --directory /项目路径 --recent 5
```

### 🛠️ 生成技能

运行 harness 管道生成技能文件：

```bash
node dist/cli/main.js generate \
  --directory /项目路径 \
  --recent 10 \
  --output generated-skills/my-skill \
  --tone balanced
```

**参数说明：**

| 参数 | 说明 |
|------|------|
| `--directory` | 要分析的项目目录（绝对路径） |
| `--recent` | 分析最近 N 个会话 |
| `--output` | 输出目录 |
| `--tone` | 输出风格：`concise`（简洁）/ `balanced`（平衡）/ `detailed`（详细） |
| `--force` | 覆盖已存在的输出文件 |

**生成的文件：**

| 文件 | 说明 |
|------|------|
| `SKILL.md` | 🎯 最终技能文件，包含基于证据的声明 |
| `summary.md` | 📊 人类可读的审计摘要 |
| `claim-manifest.json` | 📋 声明清单及证据引用 |
| `skeptic-report.json` | 🤔 质疑报告：发现的问题、总体评分 |
| `verifier-report.json` | ✅ 验证报告：通过/失败、伪造指令检测 |
| `llm-traces.json` | 🔍 所有 LLM 调用追踪（已脱敏） |

### 📊 评估技能

对生成的技能文件运行质量检查：

```bash
node dist/cli/main.js evaluate --skill generated-skills/my-skill/SKILL.md
```

检查项包括：
- ✅ Lint 规则检查
- ✅ 敏感信息脱敏
- ✅ 证据基础验证
- ✅ 综合评分

### 🌐 启动 Web UI

启动本地 Web 服务器浏览生成的运行记录：

```bash
# 一键构建并启动
npm run build:all
node dist/cli/main.js serve --directory /项目路径
```

**访问地址：**
- 🏠 本地：http://localhost:3000
- 🌐 内网：http://100.98.177.122:3000

**Web UI 功能：**
- 📊 运行仪表盘 — 查看所有生成的技能运行
- 📝 详情页 — 查看审计、报告、预览
- 🔍 证据链追溯 — 点击展开查看证据详情
- 🌏 多语言支持 — 中文/英文切换

**验证 Web 管道：**

```bash
npm run verify:web
```

---

## 🔒 隐私说明

⚠️ **重要：** harness 管道会将你的**原始会话证据**（消息文本、工具调用、diff）发送到你配置的 LLM 端点。

- 默认情况下，数据发送到 `SESSION2SKILLS_LLM_BASE_URL` 指定的端点
- **不会**发送到 session2skills 作者维护的任何服务器
- `llm-traces.json` 中的请求内容和原始响应文本已脱敏处理

**建议：** 如果会话包含敏感代码或凭据，请指向自托管或私有端点。

---

## 🛠️ 开发指南

### 开发命令

```bash
npm run typecheck    # TypeScript 类型检查
npm run build        # 构建后端
npm run build:web    # 构建 Web UI
npm run build:all    # 构建全部
npm run dev          # 开发模式（无需构建）
npm test             # 运行测试
npm run verify:web   # 验证 Web 管道
```

### 项目结构

```
src/
├── cli/            # Commander CLI 入口 + 子命令
├── adapters/       # 外部系统适配器
├── analyze/        # 核心分析管道
├── generate/       # 技能渲染管道
├── llm/            # LLM 抽象层
├── normalize/      # 会话规范化
├── persist/        # 安全的目录写入
├── profile/        # 启发式分析
└── shared/         # 共享工具
web/                # Web UI 前端
tests/              # 测试文件
```

---

## 📈 输出风格

使用 `--tone` 参数控制输出详细程度：

| 风格 | 说明 | 适用场景 |
|------|------|----------|
| `concise` | 简短摘要，最少证据摘录 | 快速浏览 |
| `balanced` | 适中详细（默认） | 日常使用 |
| `detailed` | 完整证据摘录，按来源分解 | 深入分析 |

---

## ⚠️ 当前限制

- 📦 仅支持 OpenCode（暂无其他会话源）
- 📚 仅分析历史会话
- 💻 仅 CLI 模式（无服务/守护进程）
- 🤖 LLM 管道非零幻觉 — 声明基于证据交叉检查，但最终输出仍反映模型推断

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'feat: add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

---

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

## 🔗 相关链接

- [GitHub 仓库](https://github.com/YingkeSu/session2skills)
- [Issues](https://github.com/YingkeSu/session2skills/issues)
- [OpenCode](https://opencode.ai)
