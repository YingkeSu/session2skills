# session2skills

> 🤖 Transform your OpenCode sessions into reusable AI assistant skill files

[![GitHub Stars](https://img.shields.io/github/stars/YingkeSu/session2skills?style=social)](https://github.com/YingkeSu/session2skills)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[中文文档](README_ZH.md)**

---

## ✨ What is it?

**session2skills** is a CLI tool that:

1. 📖 Reads your local OpenCode session records
2. 🔍 Analyzes your work patterns and habits
3. 📝 Generates `SKILL.md` skill files for AI assistant reuse

The core feature is the **harness pipeline** — a four-stage LLM processing flow:

```
Analyst → Skeptic → Writer → Verifier
```

Every claim in the output is grounded in session evidence and cross-checked by the Skeptic and Verifier.

---

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/YingkeSu/session2skills.git
cd session2skills

# Install dependencies and build
npm install
npm run build
```

### 2. Prerequisites

- ✅ `opencode` CLI installed and on `PATH`
- ✅ OpenCode session records exist in the project directory

### 3. Configure LLM Environment Variables

```bash
# Required
export SESSION2SKILLS_LLM_BASE_URL="https://api.example.com/v1"
export SESSION2SKILLS_LLM_MODEL="gpt-4o"

# Optional
export SESSION2SKILLS_LLM_API_KEY="sk-..."
export SESSION2SKILLS_LLM_PROVIDER="openai-compatible"
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION2SKILLS_LLM_BASE_URL` | ✅ | OpenAI-compatible API base URL |
| `SESSION2SKILLS_LLM_MODEL` | ✅ | Model identifier (e.g., `gpt-4o`, `claude-3-opus`) |
| `SESSION2SKILLS_LLM_API_KEY` | ❌ | API key (not needed for some local/self-hosted endpoints) |
| `SESSION2SKILLS_LLM_PROVIDER` | ❌ | Provider label, defaults to `openai-compatible` |
| `SESSION2SKILLS_LLM_MODEL_VERSION` | ❌ | Optional version label |

### 4. Configure Session Source Adapter

session2skills supports multiple session sources, selected via the `SESSION2SKILLS_ADAPTER` environment variable:

```bash
export SESSION2SKILLS_ADAPTER="claude"  # or "codex", "sdk", "sqlite"
```

| Adapter | Description | Data Source |
|---------|-------------|-------------|
| `sdk` | OpenCode SDK (default) | Fetches sessions via OpenCode API |
| `sqlite` | OpenCode SQLite direct read | Reads local SQLite database directly |
| `codex` | Codex CLI | Reads Codex's SQLite database and rollout files |
| `claude` | Claude CLI | Reads Claude's JSONL transcript files |

**Auto-detection:** If `SESSION2SKILLS_ADAPTER` is not set, the tool automatically selects in this priority order:
1. OpenCode SQLite database detected → use `sqlite`
2. Otherwise → use `sdk` (OpenCode API)

#### Codex Adapter

For users of [Codex CLI](https://github.com/openai/codex):

```bash
export SESSION2SKILLS_ADAPTER="codex"
node dist/cli/main.js inspect --directory /project/path --recent 5
```

**Data location:** `~/.codex/sessions.db` (SQLite database)

#### Claude Adapter

For users of [Claude CLI](https://docs.anthropic.com/claude/docs/cli):

```bash
export SESSION2SKILLS_ADAPTER="claude"
node dist/cli/main.js inspect --directory /project/path --recent 5
```

**Data location:** `~/.claude/projects/<project-hash>/` (JSONL transcript files)

---

## 📖 Command Guide

### 🔍 Inspect Sessions

View recent OpenCode sessions:

```bash
node dist/cli/main.js inspect --directory /project/path --recent 5
```

### 🛠️ Generate Skills

Run the harness pipeline to generate skill files:

```bash
node dist/cli/main.js generate \
  --directory /project/path \
  --recent 10 \
  --output generated-skills/my-skill \
  --tone balanced
```

**Parameters:**

| Parameter | Description |
|-----------|-------------|
| `--directory` | Project directory to analyze (absolute path) |
| `--recent` | Analyze the most recent N sessions |
| `--output` | Output directory |
| `--tone` | Output style: `concise` / `balanced` / `detailed` |
| `--force` | Overwrite existing output files |

**Generated files:**

| File | Description |
|------|-------------|
| `SKILL.md` | 🎯 Final skill file with evidence-based claims |
| `summary.md` | 📊 Human-readable audit summary |
| `claim-manifest.json` | 📋 Claim manifest with evidence references |
| `skeptic-report.json` | 🤔 Skeptic report: issues found, overall score |
| `verifier-report.json` | ✅ Verifier report: pass/fail, fabricated directive detection |
| `llm-traces.json` | 🔍 All LLM call traces (sanitized) |

### 📊 Evaluate Skills

Run quality checks on generated skill files:

```bash
node dist/cli/main.js evaluate --skill generated-skills/my-skill/SKILL.md
```

Checks include:
- ✅ Lint rule validation
- ✅ Sensitive information sanitization
- ✅ Evidence grounding verification
- ✅ Overall score

### 🌐 Launch Web UI

Start a local web server to browse generated run records:

```bash
# Build everything and launch
npm run build:all
node dist/cli/main.js serve --directory /project/path
```

**Access URLs:**
- 🏠 Local: http://localhost:3000
- 🌐 Network: http://100.98.177.122:3000

**Web UI features:**
- 📊 Run dashboard — view all generated skill runs
- 📝 Detail pages — view audit, reports, previews
- 🔍 Evidence chain tracing — click to expand evidence details
- 🌏 Multi-language support — Chinese/English switching

**Verify Web Pipeline:**

```bash
npm run verify:web
```

---

## 🔒 Privacy Notice

⚠️ **Important:** The harness pipeline sends your **raw session evidence** (message text, tool calls, diffs) to your configured LLM endpoint.

- By default, data is sent to the endpoint specified by `SESSION2SKILLS_LLM_BASE_URL`
- It is **NOT** sent to any server maintained by the session2skills authors
- Request content and raw response text in `llm-traces.json` are sanitized

**Recommendation:** If your sessions contain sensitive code or credentials, point to a self-hosted or private endpoint.

---

## 🛠️ Development Guide

### Development Commands

```bash
npm run typecheck    # TypeScript type checking
npm run build        # Build backend
npm run build:web    # Build Web UI
npm run build:all    # Build everything
npm run dev          # Development mode (no build needed)
npm test             # Run tests
npm run verify:web   # Verify web pipeline
```

### Project Structure

```
src/
├── cli/            # Commander CLI entry + sub-commands
├── adapters/       # External system adapters
├── analyze/        # Core analysis pipeline
├── generate/       # Skill rendering pipeline
├── llm/            # LLM abstraction layer
├── normalize/      # Session normalization
├── persist/        # Secure directory writing
├── profile/        # Heuristic profiling
└── shared/         # Shared utilities
web/                # Web UI frontend
tests/              # Test files
```

---

## 📈 Output Styles

Use the `--tone` parameter to control output verbosity:

| Style | Description | Use Case |
|-------|-------------|----------|
| `concise` | Brief summary, minimal evidence excerpts | Quick overview |
| `balanced` | Moderate detail (default) | Daily use |
| `detailed` | Full evidence excerpts, breakdown by source | Deep analysis |

---

## ⚠️ Current Limitations

- 📦 Only supports OpenCode (no other session sources yet)
- 📚 Only analyzes historical sessions
- 💻 CLI mode only (no service/daemon)
- 🤖 LLM pipeline has non-zero hallucination — claims are cross-checked against evidence, but final output still reflects model inference

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push the branch: `git push origin feature/amazing-feature`
5. Submit a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE)

---

## 🔗 Links

- [GitHub Repository](https://github.com/YingkeSu/session2skills)
- [Issues](https://github.com/YingkeSu/session2skills/issues)
- [OpenCode](https://opencode.ai)
