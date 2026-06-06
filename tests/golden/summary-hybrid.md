# Session2Skills Audit Summary

schema: profile/v2
prompt-set: prompt-set/v1
claims: 4

## Strongest Signals

### Work style

- **analysis-first** (confidence: 0.856, status: accepted, sources: rule+llm)
  > 2 supporting claim(s) (1 rule, 1 llm) with 3 evidence citation(s) across 2 session(s). Rule and LLM agreement increased confidence. No contradictory label pair was detected.

### Communication style

- **concise** (confidence: 0.412, status: tentative, sources: llm)
  > 1 supporting claim(s) (0 rule, 1 llm) with 1 evidence citation(s) across 1 session(s). No cross-source agreement bonus applied. Contradictions surfaced with explanatory, so confidence was reduced.

### Validation habits

- **run-diagnostics** (confidence: 0.780, status: accepted, sources: rule)
  > 1 supporting claim(s) (1 rule, 0 llm) with 2 evidence citation(s) across 1 session(s). No cross-source agreement bonus applied. No contradictory label pair was detected.

### Constraints

- **type-safety** (confidence: 0.720, status: accepted, sources: rule)
  > 1 supporting claim(s) (1 rule, 0 llm) with 1 evidence citation(s) across 1 session(s). No cross-source agreement bonus applied. No contradictory label pair was detected.

### Token efficiency
- No claims.

### Model selection
- No claims.

### Delegation patterns
- No claims.

## Confidence Notes

- Work style derived from 2 sessions with cross-source agreement.
- Validation habits have limited evidence (1 session).

## Unresolved Areas

- concise (communication-style): confidence 0.412 [contradicted]
  > 1 supporting claim(s) (0 rule, 1 llm) with 1 evidence citation(s) across 1 session(s). No cross-source agreement bonus applied. Contradictions surfaced with explanatory, so confidence was reduced.

## Evidence Excerpts

### work-style/analysis-first

- [message] Let me explore the repository structure first (ses_abc:msg_001)
- [tool] Read directory structure before implementing (ses_abc:msg_005)
- [summary] User prefers understanding codebase before changes (ses_def)

### validation-habit/run-diagnostics

- [tool] Ran lsp_diagnostics after edit (ses_abc:msg_007)

### constraint/type-safety

- [message] Always pass typecheck before committing (ses_abc:msg_009)

### communication-style/concise

- [message] Keep it short (ses_abc:msg_003)

## Source Attribution

- merged:work-style:analysis-first: 0.856 | rule, llm | 2 source(s)
- merged:validation-habit:run-diagnostics: 0.780 | rule | 1 source(s)
- merged:constraint:type-safety: 0.720 | rule | 1 source(s)
- merged:communication-style:concise: 0.412 | llm | 1 source(s)
