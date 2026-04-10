# session2skills

CLI that reads your local OpenCode sessions, figures out how you work, and writes a `SKILL.md` file your AI assistant can pick up.

It has two modes. **Legacy** mode runs purely local heuristics, fast and private. **Hybrid** mode sends session evidence to an LLM you configure, producing richer claims, a full audit trail, and a structured skill plan.

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

### Analyze sessions

**Legacy** (local heuristics only):

```bash
node dist/cli/main.js analyze \
  --directory /absolute/project/path \
  --recent 5 \
  --out .session2skills/runs/latest \
  --tone balanced
```

Writes `normalized.json` and `profile.json`.

**Hybrid** (LLM-enhanced):

```bash
export SESSION2SKILLS_LLM_BASE_URL="https://api.example.com/v1"
export SESSION2SKILLS_LLM_MODEL="gpt-4o"
export SESSION2SKILLS_LLM_API_KEY="sk-..."

node dist/cli/main.js analyze \
  --directory /absolute/project/path \
  --recent 5 \
  --out .session2skills/runs/latest \
  --hybrid \
  --tone balanced
```

Writes a full artifact tree: `normalized.json`, `profile.json`, `evidence-index.json`, `rule-claims.json`, `llm-session-claims.json`, `llm-category-claims.json`, `merged-claims.json`, `skill-plan.json`, `llm-traces.json`, `manifest.json`.

Use `--force` to overwrite an existing output directory.

### Generate final artifacts

**Legacy:**

```bash
node dist/cli/main.js generate \
  --directory /absolute/project/path \
  --recent 5 \
  --output generated-skills/my-skill \
  --tone balanced
```

Writes `summary.md` and `SKILL.md`.

**Hybrid:**

```bash
node dist/cli/main.js generate \
  --directory /absolute/project/path \
  --recent 5 \
  --output generated-skills/my-skill \
  --hybrid \
  --tone balanced
```

Writes `summary.md`, `SKILL.md`, `merged-claims.json`, and `skill-plan.json`.

**From a saved profile:**

```bash
node dist/cli/main.js generate \
  --profile .session2skills/runs/latest/profile.json \
  --output generated-skills/from-profile \
  --tone concise
```

If the profile was produced by `analyze --hybrid` (a `profile/v2` artifact), `generate` will detect it and use the hybrid rendering path automatically. You can point `--profile` at a directory that contains sibling artifacts like `skill-plan.json` and `merged-claims.json`, and they'll be reused instead of recomputed.

Use `--force` to overwrite existing output files.

## Configuration

Hybrid mode reads these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION2SKILLS_LLM_BASE_URL` | Yes | OpenAI-compatible API base URL |
| `SESSION2SKILLS_LLM_MODEL` | Yes | Model identifier (e.g. `gpt-4o`, `claude-3-opus-20240229`) |
| `SESSION2SKILLS_LLM_API_KEY` | No | API key. Some local/self-hosted endpoints don't need one. |
| `SESSION2SKILLS_LLM_PROVIDER` | No | Provider label for traces. Defaults to `openai-compatible`. |
| `SESSION2SKILLS_LLM_MODEL_VERSION` | No | Optional version tag written into traces and manifests. |

### Privacy note

Hybrid mode sends your **raw session evidence** (message text, tool invocations, diffs) to the LLM endpoint you configure. By default, that endpoint is whatever you set in `SESSION2SKILLS_LLM_BASE_URL`. Nothing is sent to any server maintained by the session2skills authors.

If your sessions contain sensitive code or credentials, you should:
- Point `SESSION2SKILLS_LLM_BASE_URL` at a self-hosted or private endpoint, or
- Stick with legacy mode, which never leaves your machine.

## Output artifacts

### Legacy artifacts

| File | Description |
|------|-------------|
| `normalized.json` | Raw normalized session data |
| `profile.json` | Heuristic preference profile |
| `summary.md` | Human-readable summary |
| `SKILL.md` | Skill file for your AI assistant |

### Hybrid artifacts

See [docs/hybrid-artifacts.md](docs/hybrid-artifacts.md) for the full guide. Quick reference:

| File | Description |
|------|-------------|
| `normalized.json` | Raw normalized session data |
| `profile.json` | Profile with merged claims (`profile/v2` schema) |
| `evidence-index.json` | Evidence items with stable IDs |
| `rule-claims.json` | Claims from heuristic rules |
| `llm-session-claims.json` | Claims extracted by the LLM per session |
| `llm-category-claims.json` | Claims synthesized by the LLM per dimension |
| `merged-claims.json` | Final claims after cross-source reconciliation |
| `skill-plan.json` | Structured directives derived from accepted claims |
| `llm-traces.json` | Every LLM call: prompts, responses, token usage |
| `manifest.json` | Run metadata: schema versions, timestamps, config |
| `summary.md` | Debug-friendly audit summary with evidence excerpts |
| `SKILL.md` | Final skill file |

## Tone presets

The `--tone` flag controls output verbosity:

- `concise` - short summaries, minimal evidence excerpts
- `balanced` - moderate detail (default)
- `detailed` - full evidence excerpts, per-source breakdowns, grounding notes

## Development

```bash
npm run typecheck
npm run build
npm test
```

## Current limitations

- OpenCode only (no other session sources yet)
- Historical session analysis only
- CLI only, no service/daemon mode
- Heuristics are intentionally simple and evidence-driven
- Profile quality depends on the quality and quantity of available sessions
- Constraint detection is weaker than workflow or validation detection
- Hybrid mode is not hallucination-free. LLM claims are cross-checked against rule claims and scored for confidence, but the final output still reflects what the model inferred from your sessions
