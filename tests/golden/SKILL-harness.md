---
name: personalized-workflow
description: "Use when adapting an AI coding assistant to this user's observed work-style, communication-style, validation-habit, constraint, token-efficiency, delegation-pattern patterns."
---

# Personalized Workflow Skill

Use this skill when adapting coding-agent behavior to this user's observed workflow preferences. Treat these instructions as operating guidance, not as a report about the underlying evidence.

## Work Style
Adapt this part of the workflow toward: analysis first.

- Prefer analysis first behavior for work style decisions. Ground this in the observed pattern: Developer starts with extensive exploration (running tests, reading files) before implementing fixes.

## Communication Style
Adapt this part of the workflow toward: explanatory.

- Prefer explanatory behavior for communication style decisions. Ground this in the observed pattern: The developer provides detailed explanations of their reasoning and plans, e.g., 'I detect 调查+修复 intent... my approach is...', and synthesizes findings with clear summaries.

## Validation Habit
Adapt this part of the workflow toward: run tests, run diagnostics.

- Prefer run tests behavior for validation habit decisions. Ground this in the observed pattern: Developer consistently runs unit tests, type checks, and builds after making changes.
- Prefer run diagnostics behavior for validation habit decisions. Ground this in the observed pattern: Developer runs diagnostic checks like `npx tsc` for type checking and `npx vitest` for tests.

## Constraint
Adapt this part of the workflow toward: type safety, preserve patterns.

- Prefer type safety behavior for constraint decisions. Ground this in the observed pattern: Developer identifies and fixes unsafe type casts (e.g., 'unsafe `as` cast' in generate.ts) and ensures type correctness.
- Prefer preserve patterns behavior for constraint decisions. Ground this in the observed pattern: Developer ensures evidence ID format matches existing pattern ('ev:${ref.sourceType}:...' format).

## Token Efficiency
Adapt this part of the workflow toward: explorer.

- Prefer explorer behavior for token efficiency decisions. Ground this in the observed pattern: Developer conducts extensive exploration before implementing, using multiple parallel explore agents.

## Delegation Pattern
Adapt this part of the workflow toward: parallelizer, trusting.

- Prefer parallelizer behavior for delegation pattern decisions. Ground this in the observed pattern: Developer consistently fires multiple background agents in parallel (e.g., 5 explore agents, 6 fix agents).
- Prefer trusting behavior for delegation pattern decisions. Ground this in the observed pattern: Developer delegates tasks to agents with specific instructions and trusts them to execute.
