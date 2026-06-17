# session2skills

CLI that reads your local OpenCode sessions, figures out how you work, and writes a `SKILL.md` file your AI assistant can pick up.

The `generate` command runs a multi-stage LLM pipeline — the **harness** (Analyst → Skeptic → Writer → Verifier) — and requires LLM environment variables to be set.

## Install

```bash
npm install
npm run build
```

## Prerequisites

- `opencode` CLI available on `PATH`
- Existing OpenCode sessions in the project directory you want to analyze

## Commands

### Inspect recent sessions

```bash
node dist/cli/main.js inspect --directory /absolute/project/path --recent 5
```

### Generate final artifacts

`generate` runs the **harness** pipeline and requires LLM environment variables (`SESSION2SKILLS_LLM_BASE_URL` + `SESSION2SKILLS_LLM_MODEL`). If they are not set, the command exits with a clear error.

```bash
export SESSION2SKILLS_LLM_BASE_URL="https://api.example.com/v1"
export SESSION2SKILLS_LLM_MODEL="gpt-4o"
export SESSION2SKILLS_LLM_API_KEY="sk-..."

node dist/cli/main.js generate \
  --directory /absolute/project/path \
  --recent 10 \
  --output generated-skills/my-skill \
  --tone balanced
```

Writes `summary.md`, `SKILL.md`, `claim-manifest.json`, `skeptic-report.json`, `verifier-report.json`, and `llm-traces.json`. The harness pipeline runs 4 stages: Analyst → Skeptic → Writer → Verifier. Each claim in the output is grounded in session evidence and cross-checked by the Skeptic and Verifier stages.

Use `--force` to overwrite existing output files.

### Evaluate a generated skill

```bash
node dist/cli/main.js evaluate --skill generated-skills/my-skill/SKILL.md
```

Runs deterministic quality gates (lint, redaction, grounding) against a skill file and reports a pass/fail verdict with scores.

### Serve the web UI

```bash
npm run build:all
node dist/cli/main.js serve --directory /absolute/project/path
```

Starts a local web server for browsing generated harness runs. Preconditions:

- Backend CLI is built: `dist/cli/main.js` exists. `npm run build:all` creates it.
- Web assets are built: `web/dist/index.html` exists. `npm run build:all` creates it.
- The served project directory contains a seeded `generated-skills/<run-name>/` directory with the generated run artifacts, such as `SKILL.md`, `claim-manifest.json`, `skeptic-report.json`, `verifier-report.json`, and `llm-traces.json`.

Use `generate --output generated-skills/<run-name>` to seed a real run before serving a project directory.

To verify the local web pipeline without relying on local OpenCode sessions:

```bash
npm run verify:web
```

This builds the backend and web assets, seeds a temporary `generated-skills/alpha-run`, starts `serve`, and checks health, `/api/runs`, the SPA shell, and bundled asset serving.

## Configuration

The harness pipeline reads these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION2SKILLS_LLM_BASE_URL` | Yes | OpenAI-compatible API base URL |
| `SESSION2SKILLS_LLM_MODEL` | Yes | Model identifier (e.g. `gpt-4o`, `claude-3-opus-20240229`) |
| `SESSION2SKILLS_LLM_API_KEY` | No | API key. Some local/self-hosted endpoints don't need one. |
| `SESSION2SKILLS_LLM_PROVIDER` | No | Provider label for traces. Defaults to `openai-compatible`. |
| `SESSION2SKILLS_LLM_MODEL_VERSION` | No | Optional version tag written into traces and manifests. |

### Privacy note

The harness pipeline sends your **raw session evidence** (message text, tool invocations, diffs) to the LLM endpoint you configure. By default, that endpoint is whatever you set in `SESSION2SKILLS_LLM_BASE_URL`. Nothing is sent to any server maintained by the session2skills authors.

Generated artifacts such as `normalized.json`, `evidence-index.json`, and claim files can still contain session evidence. `llm-traces.json` is safer by default: request message content and raw model text are redacted before writing, while model/provider metadata, token usage, and parsed structured output are retained for auditing.

If your sessions contain sensitive code or credentials, you should point `SESSION2SKILLS_LLM_BASE_URL` at a self-hosted or private endpoint.

## Output artifacts

### Harness artifacts

| File | Description |
|------|-------------|
| `summary.md` | Human-readable audit summary |
| `SKILL.md` | Final skill file with evidence-grounded claims |
| `claim-manifest.json` | Canonical claim manifest with evidence refs (`claim-manifest/v1` schema) |
| `skeptic-report.json` | Skeptic critique: issues found, overall score (`skeptic-report/v1` schema) |
| `verifier-report.json` | Verifier cross-check: pass/fail, fabricated directive detection (`verifier-report/v1` schema) |
| `llm-traces.json` | Every LLM call across all 4 pipeline stages with redacted prompt/raw response text |

## Tone presets

The `--tone` flag controls output verbosity:

- `concise` - short summaries, minimal evidence excerpts
- `balanced` - moderate detail (default)
- `detailed` - full evidence excerpts, per-source breakdowns, grounding notes

## Development

```bash
npm run typecheck
npm run build
npm run build:web
npm run verify:web
npm test
```

## Current limitations

- OpenCode only (no other session sources yet)
- Historical session analysis only
- CLI only, no service/daemon mode
- The harness pipeline is not hallucination-free. LLM claims are cross-checked against session evidence and scored for confidence, but the final output still reflects what the model inferred from your sessions
