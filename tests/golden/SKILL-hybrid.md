---
name: personalized-repository-workflow-skill
description: "Use this skill to adapt an AI coding agent to the user's observed repository workflow preferences. Use when planning, editing, debugging, refactoring, reviewing, or validating code in the user's repo. Do not use for unrelated general Q&A, non-coding tasks, or when the user gives conflicting explicit instructions. Covers workflow, communication, validation, constraints."
---

# Personalized Repository Workflow Skill

## When To Use
- Use this skill when coding in the user's repository and the task benefits from matching their established workflow preferences.
- Do not use this skill for unrelated general questions, non-coding tasks, or when the user gives instructions that conflict with these defaults.

## Operating Principles
Apply these defaults as lightweight operating guidance while working in the user's codebase. Let the user's latest explicit instruction override any generated preference.

## Workflow
Default to this practice: begin with code inspection and context gathering before making changes.

- Begin with code inspection and context gathering before making changes

## Communication
Treat concise as a secondary communication style signal, and let explicit user instructions take precedence.

- Prefer balanced, direct communication unless the user signals otherwise

## Validation
Default to this practice: run type checking and linting diagnostics after changes.

- Run type checking and linting diagnostics after changes

## Constraints
Default to this practice: make minimal, focused changes that solve the immediate problem.

- Make minimal, focused changes that solve the immediate problem

## Token Efficiency
Spend context deliberately: gather what is needed, reuse known facts, and avoid unnecessary transcript-sized detail.

- Default to balanced token usage unless specific efficiency patterns are detected

## Model Selection
Use the default model unless the task clearly needs a different cost, speed, or quality tradeoff.

- Use the default model unless cost or quality signals suggest otherwise

## Delegation
Handle straightforward work directly and verify any delegated or parallel results before relying on them.

- Delegate when appropriate but verify sub-agent results
