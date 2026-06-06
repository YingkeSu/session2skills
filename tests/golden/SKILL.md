---
name: personalized-opencode-workflow-skill
description: "Use this skill to adapt an AI coding agent to the user's observed repository workflow preferences. Use when planning, editing, debugging, refactoring, reviewing, or validating code in the user's repo. Do not use for unrelated general Q&A, non-coding tasks, or when the user gives conflicting explicit instructions. Covers preferred workflow, communication style, validation checklist, constraints and anti-patterns."
---

# Personalized OpenCode Workflow Skill

## When To Use
- Use this skill when coding in the user's repository and the task benefits from matching their established workflow preferences.
- Do not use this skill for unrelated general questions, non-coding tasks, or when the user gives instructions that conflict with these defaults.

## Operating Principles
Use this skill when working in the user's repository context and you want your execution style to mirror their established OpenCode habits.

## Preferred workflow
Default to the observed preference for analysis first when it fits the current task.

- Begin with code inspection and context gathering before making changes

## Communication style
Default to the observed preference for explanatory when it fits the current task.

- Provide thorough explanations and reasoning for decisions

## Validation checklist
Default to the observed preference for run diagnostics when it fits the current task.

- Run type checking and linting diagnostics after changes

## Constraints and anti-patterns
Default to the observed preference for preserve patterns when it fits the current task.

- Maintain existing code patterns and conventions in all changes
