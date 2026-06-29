# Product

## Register

product

## Users

Engineers and power-users of AI coding assistants — people running OpenCode, Codex CLI, or Claude CLI on real projects. They are technical, skeptical of LLM output, and care about provenance: they want to know *why* a generated skill says what it says, and to catch hallucinations before they trust a `SKILL.md`. Their context is a quiet, focused laptop session — auditing a run, tracing an evidence chain, or kicking off a new generation — often with terminal panes and docs open alongside. They are not browsing; they are verifying.

## Product Purpose

session2skills turns historical AI-coding sessions into reusable, trustworthy skill files through a four-stage LLM harness — Analyst → Skeptic → Writer → Verifier — where every directive traces back to session evidence and is cross-checked for fabrication. It exists for *trustworthy extraction*: an unsupported claim must never reach the final `SKILL.md` unnoticed. Success is a user who opens a run, sees the evidence behind any instruction, trusts the verdict, and ships the skill — fast, and without manual forensic effort.

The Web UI (this design surface) is the control panel around that pipeline: browse runs, trigger generations, watch the harness progress, and drill into audit reports, previews, and traces.

## Brand Personality

Precise, forensic, calm. An audit instrument, not a sales tool. The voice is exact and unhurried — it states what the evidence supports and is honest about confidence and gaps. Three words: **forensic, trustworthy, composed**. It should feel like a well-kept lab notebook or a reference instrument: quiet confidence that earns trust by showing its work, never by performing a certainty it doesn't have.

## Anti-references

- **Bootstrap / admin-template chrome.** Generic blue (`#0d6efd`) buttons, side-stripe accent cards, the default "admin panel" vocabulary. The current UI leans this way — we are moving away from it.
- **Over-styled "AI product" look.** Glassmorphism, gradient text, aurora blobs, and gimmicky motion — the saturated AI aesthetic that signals "generated" rather than "engineered."
- **Identity-less dashboards.** Flat gray panels and tables with no point of view — technically legible but with nothing that reads as deliberate or memorable.

## Design Principles

1. **Show the work.** Evidence, provenance, and confidence are first-class — never buried behind a single verdict. If a claim exists, its source is one click away. The interface earns trust by exposing its reasoning.
2. **Quiet confidence over performed certainty.** Calm, restrained surfaces; let the data carry authority. No decorative gradients, no vanity motion, no hero-metric performance.
3. **Precision in every detail.** Typographic hierarchy, alignment, spacing rhythm, and color semantics are exact and consistent — the craft of the tool reflects the rigor of the pipeline.
4. **Legibility under scrutiny.** This UI is read carefully, not glanced at. Contrast, type sizes, and dense data layouts (tables, traces, manifests) must hold up across long audit sessions.
5. **One coherent system, not a patchwork.** Tokens, components, and states share one vocabulary so the dashboard, detail page, and docs read as a single instrument.

## Accessibility & Inclusion

WCAG 2.2 AA baseline. Status and scores must be conveyed by text or shape, not hue alone — color-blind-safe semantics for pass/fail and good/warning/danger states. Reduced motion is respected throughout (the existing pulse animation needs a guard). Dense tables and traces stay keyboard-navigable with visible, sufficient focus indicators.
