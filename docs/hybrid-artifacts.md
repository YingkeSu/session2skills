# Hybrid Artifact Interpretation Guide

This guide explains every file produced by `session2skills analyze --hybrid` and `session2skills generate --hybrid`. Use it to inspect outputs, debug unexpected results, or build tools on top of the artifact tree.

## Artifact tree

A hybrid `analyze` run writes to the directory you pass with `--out`. A typical tree looks like this:

```
.session2skills/runs/latest/
  manifest.json                # run metadata and schema versions
  normalized.json              # raw normalized session data
  profile.json                 # profile/v2 with merged claims
  evidence-index.json          # evidence items keyed by stable IDs
  rule-claims.json             # claims produced by heuristic rules
  llm-session-claims.json      # claims produced by LLM per-session extraction
  llm-category-claims.json     # claims produced by LLM dimension synthesis
  merged-claims.json           # final reconciled claims (accepted/tentative/rejected)
  skill-plan.json              # structured skill directives
  llm-traces.json              # every LLM call with redacted prompt/raw response text
```

A hybrid `generate` run writes to the directory you pass with `--output`:

```
generated-skills/my-skill/
  summary.md                   # human-readable audit summary
  SKILL.md                     # final skill file
  merged-claims.json           # copy of merged claims for reference
  skill-plan.json              # copy of skill plan for reference
```

## Artifact reference

### manifest.json

The entry point. Contains run metadata so you know exactly what produced the other files.

```json
{
  "schemaVersion": "run-manifest/v1",
  "runID": "run:m1k2j3k",
  "generatedAt": "2025-04-10T12:34:56.789Z",
  "directory": "/absolute/project/path",
  "sessionIDs": ["ses_abc123", "ses_def456"],
  "promptSetVersion": "prompt-set/v1",
  "artifacts": [
    { "kind": "normalized-sessions", "fileName": "normalized.json", "schemaVersion": "normalized-session/v1" },
    { "kind": "merged-claims", "fileName": "merged-claims.json", "schemaVersion": "merged-claim/v1" }
  ],
  "metadata": {
    "mode": "hybrid",
    "tone": "balanced",
    "llm": {
      "provider": "openai-compatible",
      "model": "gpt-4o"
    },
    "schemaVersions": { ... },
    "skillRenderMode": "llm"
  }
}
```

**What to look for:**
- `sessionIDs` tells you which sessions were included
- `metadata.llm` shows which model was used
- `metadata.skillRenderMode` is `"llm"` if the LLM composed the skill, `"fallback"` if the heuristic renderer took over (usually because the LLM call failed)
- `artifacts` lists every file and its schema version

### normalized.json

An array of `NormalizedSession` objects. This is the raw input to the rest of the pipeline.

Each session contains:
- `id`, `title`, `directory`, `updatedAt`
- `messages` with roles, timestamps, text, parts, and tool invocations
- `toolInvocations` with tool name, status, input, output
- `diffSummary` with files changed, additions, deletions
- `summaryText` if the session had a summary

**What to look for:**
- Are the sessions you expected present? Check `id` and `title`.
- Are messages populated with text? Empty sessions produce weak profiles.
- Check `diffSummary.filesChanged` to see how much real work happened.

### profile.json

A `ProfileV2` object. This is the central artifact that feeds into `generate`.

Structure:
```json
{
  "schemaVersion": "profile/v2",
  "promptSetVersion": "prompt-set/v1",
  "workStyle": [{ "kind": "work-style", "value": "iterative", "weight": 0.8, "evidence": [...] }],
  "communicationStyle": [...],
  "validationHabits": [...],
  "constraints": [...],
  "strongestSignals": { "work-style": [...], "communication-style": [...] },
  "acceptedClaims": [...],
  "tentativeClaims": [...],
  "unresolvedAreas": [...],
  "confidenceNotes": [...],
  "mergedClaims": [...]
}
```

The key difference from the legacy `profile.json`: this one has `schemaVersion: "profile/v2"`, `mergedClaims`, `acceptedClaims`, and `tentativeClaims`. When you pass this file to `generate --profile`, the tool detects the v2 schema and uses the hybrid rendering path.

**What to look for:**
- `acceptedClaims` vs `tentativeClaims` count. Lots of tentative claims means the LLM and rules disagreed or evidence was thin.
- `confidenceNotes` lists caveats the pipeline flagged.
- `unresolvedAreas` lists dimensions where no strong signal emerged.

### evidence-index.json

An array of `EvidenceItem` objects. Each item has a stable `evidenceID` that claims cite in their `citations` array.

```json
{
  "schemaVersion": "evidence-item/v1",
  "evidenceID": "ev-msg-abc123-0",
  "citation": {
    "evidenceID": "ev-msg-abc123-0",
    "sessionID": "ses_abc123",
    "messageID": "msg_001",
    "sourceType": "message",
    "excerpt": "User prefers iterative development with small commits"
  },
  "summaryText": "User states preference for iterative workflow",
  "dimensions": ["work-style", "communication-style"]
}
```

**What to look for:**
- Each item links back to a specific `sessionID` and `messageID`.
- `dimensions` tells you which signal categories this evidence is relevant to.
- `excerpt` is a short quote from the original session. This is the text that gets sent to the LLM.

### rule-claims.json

An array of `CandidateClaim` objects produced by the local heuristic rules. These never touch an LLM.

```json
{
  "schemaVersion": "candidate-claim/v1",
  "claimID": "rule-workstyle-iterative",
  "dimension": "work-style",
  "label": "iterative",
  "confidence": 0.72,
  "rationale": "Multiple sequential edits with intermediate checks",
  "citations": [...],
  "source": { "type": "rule", "ruleID": "iterative-detection" }
}
```

**What to look for:**
- `source.type` is always `"rule"`.
- These claims serve as a ground truth baseline. The merge step compares LLM claims against them.

### llm-session-claims.json

An array of `CandidateClaim` objects. Each one was produced by sending a single session's evidence to the LLM and asking it to extract preference signals.

```json
{
  "schemaVersion": "candidate-claim/v1",
  "claimID": "llm-ses-abc123-workstyle-0",
  "dimension": "work-style",
  "label": "iterative",
  "confidence": 0.85,
  "rationale": "User consistently asks for incremental changes",
  "citations": [...],
  "source": {
    "type": "llm-session",
    "traceID": "trace-abc123",
    "promptSetVersion": "prompt-set/v1",
    "sessionID": "ses_abc123"
  }
}
```

**What to look for:**
- `source.type` is `"llm-session"`.
- `source.traceID` links to a specific entry in `llm-traces.json` so you can see the prompt metadata, redacted message sizes, parsed structured output, and usage.
- These claims are session-local. They get cross-referenced with rule claims and category claims in the merge step.

### llm-category-claims.json

An array of `CandidateClaim` objects. Each one was produced by sending all per-session claims for a single dimension (e.g. all work-style claims across all sessions) to the LLM and asking it to synthesize a unified view.

```json
{
  "schemaVersion": "candidate-claim/v1",
  "claimID": "llm-cat-workstyle-0",
  "dimension": "work-style",
  "label": "iterative",
  "confidence": 0.9,
  "rationale": "Consistent across 4 sessions: user prefers small steps with validation",
  "citations": [...],
  "source": {
    "type": "llm-category",
    "traceID": "trace-cat-workstyle",
    "promptSetVersion": "prompt-set/v1",
    "dimension": "work-style"
  }
}
```

**What to look for:**
- `source.type` is `"llm-category"`.
- These claims represent the LLM's cross-session synthesis for a single dimension.
- If a category claim agrees with a rule claim and session claims, the merged claim gets a higher confidence.

### merged-claims.json

An array of `MergedClaim` objects. This is the final reconciled output. Each claim aggregates evidence from rule and LLM sources.

```json
{
  "schemaVersion": "merged-claim/v1",
  "claimID": "merged-workstyle-iterative",
  "dimension": "work-style",
  "label": "iterative",
  "confidence": 0.88,
  "rationale": "Agreement across rule, session, and category sources",
  "citations": [...],
  "sources": [
    {
      "claimID": "rule-workstyle-iterative",
      "dimension": "work-style",
      "label": "iterative",
      "confidence": 0.72,
      "source": { "type": "rule", "ruleID": "iterative-detection" }
    },
    {
      "claimID": "llm-ses-abc123-workstyle-0",
      "dimension": "work-style",
      "label": "iterative",
      "confidence": 0.85,
      "source": { "type": "llm-session", "traceID": "trace-abc123", ... }
    }
  ]
}
```

**What to look for:**
- `sources` shows every contributing claim (rule, session, category) and its individual confidence.
- Claims with sources from both `"rule"` and `"llm"` are more reliable.
- The `rationale` field explains why the claim was accepted or marked tentative.
- Check `profile.json` to see which merged claims ended up as `acceptedClaims` vs `tentativeClaims`.

### skill-plan.json

A `SkillPlan` object. This is the bridge between merged claims and the final `SKILL.md`.

```json
{
  "schemaVersion": "skill-plan/v1",
  "planID": "plan:abc123",
  "promptSetVersion": "prompt-set/v1",
  "title": "Workflow Skill Plan",
  "overview": "Personalized directives based on session analysis",
  "sections": [
    {
      "id": "work-style",
      "title": "Work Style",
      "summary": "Iterative developer who prefers small steps",
      "claimIDs": ["merged-workstyle-iterative"]
    }
  ],
  "directives": {
    "work-style": [
      {
        "id": "directive-workstyle-iterative-0",
        "directive": "Prefer incremental changes with intermediate validation",
        "evidenceSummary": "4 sessions with iterative patterns",
        "claimIDs": ["merged-workstyle-iterative"],
        "placement": "directive"
      }
    ]
  },
  "fallbackDirectives": { ... }
}
```

**What to look for:**
- Each `section` has `claimIDs` that link back to `merged-claims.json`.
- `directives` contains the actual instructions that will appear in `SKILL.md`.
- `fallbackDirectives` are used when the LLM composer fails. They are deterministic renderings of the same claims.
- `placement` can be `"directive"` (appears as a bullet) or `"summary-only"` (appears in section prose only).

### llm-traces.json

An array of `LLMTrace` objects. Every LLM call the pipeline made is recorded here with safe-by-default persistence: request message contents and raw model text are redacted before writing, while structured outputs, provider/model metadata, and token usage remain available for audit.

```json
{
  "schemaVersion": "llm-trace/v1",
  "traceID": "trace-abc123",
  "promptSetVersion": "prompt-set/v1",
  "stage": "session-claims",
  "provider": "openai-compatible",
  "model": "gpt-4o",
  "request": {
    "promptName": "extract-session-claims",
    "messages": [
      { "role": "system", "content": "[content omitted: 421 chars]" },
      { "role": "user", "content": "[content omitted: 6820 chars]" }
    ],
    "parameters": { "tone": "balanced", "temperature": 0.15 }
  },
  "response": {
    "finishReason": "stop",
    "structuredOutput": {
      "kind": "candidate-claims",
      "claims": [...]
    }
  },
  "usage": {
    "inputTokens": 1234,
    "outputTokens": 567,
    "totalTokens": 1801
  }
}
```

**What to look for:**
- `stage` tells you which pipeline step made the call: `"session-claims"`, `"category-claims"`, `"merge-claims"`, or `"skill-plan"`.
- `request.messages` contains redacted placeholders by default, including the omitted character count for each prompt message.
- `response.rawText` is omitted by default because raw model text may echo sensitive evidence.
- `response.structuredOutput` is the parsed result.
- `usage` shows token counts for cost tracking.
- If `finishReason` is anything other than `"stop"`, the output may be truncated or unreliable.

### summary.md

A human-readable markdown file produced by `generate`. This is not the skill file. It is an audit document.

Structure varies by tone preset, but generally includes:
- Schema and prompt-set version headers
- Strongest signals per dimension (work style, communication, validation, constraints)
- Confidence notes from the pipeline
- Unresolved areas (low-confidence or contradictory claims)
- Evidence excerpts linking claims to specific session messages
- Source attribution table (claim ID, confidence, source types, source count)

**What to look for:**
- Read this first when debugging. It gives you the big picture without opening JSON files.
- The "Unresolved Areas" section highlights claims you might want to investigate.
- Evidence excerpts show the raw quotes that back each claim.

### SKILL.md

The final output. This is the file you hand to your AI assistant.

In hybrid mode, it is either LLM-composed or fallback-rendered (check `manifest.json` `metadata.skillRenderMode`). The LLM version uses the composer, which takes the `skill-plan.json` and writes grounded prose. The fallback version is a deterministic rendering of the same plan.

Both versions reference the same claim IDs and evidence. The LLM version tends to produce more natural prose. The fallback version is more predictable and never fails.

## Traceability: from claim back to evidence

Every claim in `merged-claims.json` has a `sources` array. Each source links to a `CandidateClaim` in either `rule-claims.json`, `llm-session-claims.json`, or `llm-category-claims.json`. Each of those claims has a `citations` array with `EvidenceCitation` objects that point to specific messages in `normalized.json`.

To trace a claim:

1. Find the claim in `merged-claims.json` by `claimID`.
2. Look at `sources` to see where it came from.
3. For LLM sources, use `source.traceID` to find the redacted prompt metadata and parsed response in `llm-traces.json`.
4. Look at `citations` on the source claim. Each citation has `sessionID`, `messageID`, `sourceType`, and `excerpt`.
5. Open `normalized.json` and find the session/message with those IDs to see the full context.

## Using --profile with generate

When you run `analyze --hybrid`, the output directory contains `profile.json` (a `profile/v2` artifact) alongside the other hybrid artifacts. You can use this profile later:

```bash
node dist/cli/main.js generate \
  --profile .session2skills/runs/latest/profile.json \
  --output generated-skills/from-profile \
  --tone balanced
```

You can also pass the analyze output directory directly:

```bash
node dist/cli/main.js generate \
  --profile .session2skills/runs/latest \
  --output generated-skills/from-profile \
  --tone balanced
```

The `generate` command resolves directories to `profile.json`, then checks the profile schema version. If it's `profile/v2`, the hybrid rendering path is activated automatically. It also looks for sibling artifacts in the same directory:

- If `skill-plan.json` exists next to `profile.json`, it is loaded instead of recomputed.
- If `manifest.json` exists, its path is included in the output metadata.

This means you can run `analyze --hybrid` once, then re-run `generate` with different `--tone` values without hitting the LLM again.

## Tone behavior

The `--tone` flag affects output verbosity across all artifacts:

| Tone | Summary depth | Evidence excerpts per claim | Skill directives | Trace parameters |
|------|--------------|---------------------------|-----------------|-----------------|
| `concise` | 1 line per signal | 1 excerpt | Short bullets | `maxOutputTokens: 500` |
| `balanced` | 2-3 lines per signal | 3 excerpts | Full bullets with rationale | `maxOutputTokens: 900` |
| `detailed` | Full breakdown | 5 excerpts | Bullets with grounding notes | `maxOutputTokens: 1400` |

Tone does not change the analysis. It only changes how results are rendered.
