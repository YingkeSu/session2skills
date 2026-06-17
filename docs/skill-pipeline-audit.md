# Skill Pipeline Audit

## Installable-Style Outputs

- `review-skill`, `review-fix-skill`, `review-fix-skill-2`, `from-profile`, and `hybrid-baseline` are installable-style skills.
- They use YAML frontmatter, short agent-facing sections, and imperative guidance.

## Legacy or Partial Outputs

- `harness-deepseek-v3`, `harness-deepseek-test`, and `harness-deepseek-v2` are legacy or partial outputs.
- They still expose raw confidence, strongest-signal notes, or report-style section titles such as `## work-style`.
- `demo` is also partial because it has installable-style headings but lacks frontmatter.

## Pipeline Gap

- The writer stage already repairs missing frontmatter and can synthesize sections from claims.
- The missing guard was downstream validation: the pipeline allowed report prose like `confidence:`, `strongest signal`, and `Summary-only` to survive in production SKILL.md files.
- That mismatch is what lets old report-shaped outputs remain installable on paper while still reading like analysis artifacts instead of agent instructions.

## Change Made

- Added lint coverage for report-style confidence/rationale prose.
- `evaluateSkill` now surfaces that issue as a lint failure.

