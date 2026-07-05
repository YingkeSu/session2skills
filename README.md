# session2skills

> 🤖 Transform your OpenCode sessions into reusable AI assistant skill files

[![GitHub Stars](https://img.shields.io/github/stars/YingkeSu/session2skills?style=social)](https://github.com/YingkeSu/session2skills)
[![License](https://img.shields.io/badge/license-AGPL--3.0--only-red.svg)](LICENSE)

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

## 📖 Core Concepts

| Term | Meaning |
|------|---------|
| **Evidence** | A redacted excerpt from your session (message text, tool call, diff). Each piece has a unique `evidenceID`. |
| **Claim** | A structured assertion about your work style, tagged with a taxonomy dimension, label, confidence (0–1), and the evidence IDs that support it. |
| **ClaimManifest** | Stage 1 (Analyst) output — the full collection of claims. The source of truth for everything that follows. |
| **Skeptic** | Stage 2. Reviews every claim for being unsupported, contradicted, overconfident, vague, or duplicate. High-severity issues drop claims; medium issues reduce confidence. |
| **Writer** | Stage 3. Renders the (revised) manifest into `SKILL.md` prose. Can only render what the manifest contains — it cannot invent. |
| **Verifier** | Stage 4. Cross-checks every directive in `SKILL.md` back to a manifest claim. Fabricated or unreferenced directives force `pass=false`. |
| **Directive** | A single actionable instruction in `SKILL.md`, linked back to the claim it came from (`sourceClaimId`). |
| **Taxonomy** | The fixed 7-dimension classification: `work-style`, `communication-style`, `validation-habit`, `constraint`, `token-efficiency`, `model-selection`, `delegation-pattern`. Each dimension has canonical labels. |

> For the full architecture map (data flow, layer breakdown, module index), see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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

The harness talks to any **OpenAI-compatible** chat-completions endpoint.
Environment variables are the default; per-run overrides are available from the
CLI and Web UI (see below). Instead of pointing at a vendor directly, you can
point at an OpenAI-compatible gateway such as [LiteLLM](https://docs.litellm.ai/docs/providers/openai_compatible)
or [OpenRouter](https://openrouter.ai/) and route to many models behind one URL.

```bash
# Required
export SESSION2SKILLS_LLM_BASE_URL="https://api.example.com/v1"
export SESSION2SKILLS_LLM_MODEL="gpt-4o"

# Optional
export SESSION2SKILLS_LLM_API_KEY="sk-..."
export SESSION2SKILLS_LLM_PROVIDER="openai-compatible"
export SESSION2SKILLS_LLM_MODEL_VERSION="2024-08-06"
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION2SKILLS_LLM_BASE_URL` | ✅ | OpenAI-compatible API base URL |
| `SESSION2SKILLS_LLM_MODEL` | ✅ | Model identifier (e.g., `gpt-4o`, `claude-3-opus`) |
| `SESSION2SKILLS_LLM_API_KEY` | ❌ | API key (not needed for some local/self-hosted endpoints) |
| `SESSION2SKILLS_LLM_PROVIDER` | ❌ | Provider label, defaults to `openai-compatible` |
| `SESSION2SKILLS_LLM_MODEL_VERSION` | ❌ | Optional version label |
| `SESSION2SKILLS_API_TOKEN` | ❌ | Bearer token for `POST /api/runs` endpoint (optional auth) |

#### Per-run provider/model override

A single run can target a different provider/model than the env defaults,
without editing environment variables. This is useful for comparing models or
routing one run through a gateway.

**CLI** — `generate` options (any subset overrides the env defaults):

```bash
session2skills generate \
  --llm-provider openai \
  --llm-base-url "https://api.openai.com/v1" \
  --llm-model "gpt-4o" \
  --llm-api-key-env OPENAI_API_KEY
```

| Option | Description |
|--------|-------------|
| `--llm-provider <id>` | Provider id (e.g. `openai`, `deepseek`, `openrouter`, `ollama`, `litellm`, or any custom id) |
| `--llm-base-url <url>` | OpenAI-compatible base URL |
| `--llm-model <model>` | Model identifier |
| `--llm-model-version <ver>` | Optional model version label |
| `--llm-api-key-env <name>` | Env var holding the API key (preferred for shared/scripted use) |
| `--llm-api-key <key>` | Inline API key for local use only; it may appear in shell history or process lists, so prefer `--llm-api-key-env` |
| `--llm-path <path>` | Path appended to the base URL for chat completions |
| `--prefer-json-object <boolean>` | Force `json_object` (`true`) or disable it (`false`); defaults on for DeepSeek/ZhipuAI |

Built-in provider presets (provider id + default base URL) are available for
`openai-compatible`/custom, `openai`, `openrouter`, `deepseek`, `zhipuai`,
`ollama`, and `litellm`. They only seed defaults — you can always type any
provider id, base URL, and model.

**Web UI** — the generate panel has an **LLM Provider** section: pick a preset,
edit the base URL, enter a model, optionally set a provider id for custom
endpoints, and optionally enter an API key. Empty fields are omitted from the
request, and the API key is never written to progress files or run artifacts.

If an async worker is interrupted and later resumed, pass `llmConfig` again in
the resume request when that run used per-run provider settings. The original
per-run API key is intentionally not stored in `.progress.json`.

> DeepSeek and ZhipuAI default to `{ type: "json_object" }` structured output
> (they do not support `json_schema`). Use `--prefer-json-object false` to
> override.

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

**SQLite adapter environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION2SKILLS_DB_PATH` | `~/.local/share/opencode/opencode.db` | OpenCode SQLite database path |
| `SESSION2SKILLS_SNAPSHOT_DIR` | `~/.local/share/opencode/snapshot` | Snapshot directory for diffs |

#### Codex Adapter

For users of [Codex CLI](https://github.com/openai/codex):

```bash
export SESSION2SKILLS_ADAPTER="codex"
node dist/cli/main.js inspect --directory /project/path --recent 5
```

**Data location:** `~/.codex/state_5.sqlite` (SQLite database)

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEX_HOME` | `~/.codex` | Codex home directory |
| `CODEX_SQLITE_HOME` | `$CODEX_HOME` | Override SQLite database location |

#### Claude Adapter

For users of [Claude CLI](https://docs.anthropic.com/claude/docs/cli):

```bash
export SESSION2SKILLS_ADAPTER="claude"
node dist/cli/main.js inspect --directory /project/path --recent 5
```

**Data location:** `~/.claude/projects/<project-hash>/` (JSONL transcript files)

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Claude config directory |

---

## 📖 Command Guide

### 🔍 Inspect Sessions

View recent OpenCode sessions:

```bash
node dist/cli/main.js inspect --directory /project/path --recent 5
```

**Parameters:**

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--directory <path>` | `-d` | — | Target project directory |
| `--workspace <id>` | `-w` | — | Optional OpenCode workspace id |
| `--recent <number>` | `-r` | `10` | Number of recent sessions to inspect |

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

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--directory <path>` | `-d` | — | Target project directory |
| `--workspace <id>` | `-w` | — | Optional OpenCode workspace id |
| `--recent <number>` | `-r` | `10` | Number of recent sessions to analyze |
| `--output <path>` | `-o` | — | Output directory for artifacts |
| `--tone <preset>` | — | `balanced` | Output style: `concise` / `balanced` / `detailed` |
| `--force` | — | `false` | Allow overwriting existing outputs |

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
node dist/cli/main.js evaluate --directory /project/path
```

**Parameters:**

| Flag | Default | Description |
|------|---------|-------------|
| `--directory <path>` | — | Target project directory containing `generated-skills/` |
| `--skill-directory <path>` | — | Explicit path to skill directory (overrides `--directory`) |
| `--skill-file-name <name>` | `SKILL.md` | Name of the skill markdown file |
| `--verifier-report-file-name <name>` | `verifier-report.json` | Name of the verifier report file |
| `--size-budget <bytes>` | `120000` | Maximum allowed size for skill markdown |

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

**Parameters:**

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--directory <path>` | `-d` | — | Target project directory |
| `--port <number>` | `-p` | `3000` | HTTP port |
| `--host <address>` | `-H` | `0.0.0.0` | Hostname/IP to bind |

**Access URLs:**
- 🏠 Local: http://localhost:3000
- 🌐 Network: http://100.98.177.122:3000

**Web UI features (React + Vite):**
- 📊 Run dashboard — view all generated skill runs with status indicators
- 📝 Detail pages — tabbed view for audit, reports, preview, and traces
- 🔍 Evidence chain tracing — click to expand evidence details with lazy loading
- 🌏 Multi-language support — Chinese/English switching with locale persistence
- 📱 Responsive design — desktop and mobile viewport support
- 🔗 URL state management — `?run=<name>` query params for deep linking

**Web API endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/runs` | List all generated runs |
| `GET` | `/api/runs/:name` | Get run details (manifest, reports, traces) |
| `GET` | `/api/runs/:name/evidence/:id` | Get specific evidence item |
| `POST` | `/api/runs` | Generate a new run (requires auth if `SESSION2SKILLS_API_TOKEN` set) |
| `POST` | `/api/runs/:name/evaluate` | Run evaluation on existing run |

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
├── cli/            # Commander CLI entry + 4 sub-commands (inspect, evaluate, generate, serve)
├── adapters/       # Session source adapters (opencode, sqlite, codex, claude)
├── evidence-store/ # SQLite-backed evidence persistence
├── generate/       # Skill evaluation and rendering
├── harness/        # 4-stage LLM pipeline (analyst → skeptic → writer → verifier)
├── llm/            # LLM abstraction layer (provider, registry, prompts)
├── normalize/      # Session normalization and type models
├── persist/        # Secure staged directory write
├── server/         # Hono web server for serve command
├── sessions/       # Session loading and tree filtering
└── shared/         # Shared utilities (errors, cli, paths, redaction)
web/                # React + Vite Web UI frontend
tests/              # Unit, golden, and e2e tests
docs/               # Design docs and audit notes
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

- 📚 Only analyzes historical sessions (no real-time monitoring)
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

GNU Affero General Public License v3.0 - see [LICENSE](LICENSE)

---

## 🔗 Links

- [GitHub Repository](https://github.com/YingkeSu/session2skills)
- [Issues](https://github.com/YingkeSu/session2skills/issues)
- [OpenCode](https://opencode.ai)
