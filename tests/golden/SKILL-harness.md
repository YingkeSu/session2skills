# Personalized Workflow Skill

## work-style
- analysis-first (confidence: 0.90)
  Developer starts with extensive exploration (running tests, reading files) before implementing fixes. They use explore agents in parallel to gather information, then synthesize findings to create a work plan. This indicates an analysis-first approach.

## communication-style
- explanatory (confidence: 0.85)
  The developer provides detailed explanations of their reasoning and plans, e.g., 'I detect 调查+修复 intent... my approach is...', and synthesizes findings with clear summaries. This suggests an explanatory style.

## validation-habit
- run-tests (confidence: 1.00)
  Developer consistently runs unit tests, type checks, and builds after making changes. They explicitly check pass/fail status and fix regressions. They also run e2e tests. This shows a strong habit of running tests for validation.

## validation-habit
- run-diagnostics (confidence: 0.90)
  Developer runs diagnostic checks like `npx tsc` for type checking and `npx vitest` for tests. They also check git status and diff to verify changes. This indicates a habit of running diagnostics to validate output.

## constraint
- type-safety (confidence: 0.90)
  Developer identifies and fixes unsafe type casts (e.g., 'unsafe `as` cast' in generate.ts) and ensures type correctness. They prioritize type safety in their fixes.

## constraint
- preserve-patterns (confidence: 0.80)
  Developer ensures evidence ID format matches existing pattern ('ev:${ref.sourceType}:...' format). They check that fixes adhere to project conventions and patterns.

## token-efficiency
- explorer (confidence: 0.80)
  Developer conducts extensive exploration before implementing, using multiple parallel explore agents. This indicates a high exploration-to-implementation ratio, characteristic of an explorer pattern.

## delegation-pattern
- parallelizer (confidence: 1.00)
  Developer consistently fires multiple background agents in parallel (e.g., 5 explore agents, 6 fix agents). They wait for completion notifications and collect results. This shows a strong preference for parallel delegation.

## delegation-pattern
- trusting (confidence: 0.90)
  Developer delegates tasks to agents with specific instructions and trusts them to execute. They only verify after completion, not micromanaging. This indicates a trusting delegation style.
