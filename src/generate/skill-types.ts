import { CliUsageError } from "../shared/errors.js";

export type SkillType = "workflow" | "testing" | "code-style" | "debugging" | "review";

export const AVAILABLE_SKILL_TYPES: ReadonlyArray<SkillType> = [
  "workflow",
  "testing",
  "code-style",
  "debugging",
  "review",
];

export const SKILL_TYPE_DIMENSIONS: Record<SkillType, ReadonlyArray<string>> = {
  workflow: [
    "work-style",
    "communication-style",
    "validation-habit",
    "constraint",
    "token-efficiency",
    "model-selection",
    "delegation-pattern",
  ],
  testing: ["validation-habit", "constraint"],
  "code-style": ["work-style", "communication-style", "token-efficiency"],
  debugging: ["validation-habit", "work-style"],
  review: ["constraint", "communication-style"],
};

export const SKILL_TYPE_FOCUS: Record<SkillType, string> = {
  workflow: "general developer workflow and habits",
  testing: "testing practices, validation habits, and test-driven constraints",
  "code-style": "coding style, communication patterns, and token efficiency",
  debugging: "debugging methodology and diagnostic habits",
  review: "code review constraints and communication style",
};

export function parseSkillType(value: string): SkillType {
  if (!AVAILABLE_SKILL_TYPES.includes(value as SkillType)) {
    throw new CliUsageError(
      `Invalid skill type: ${value}. Available: ${AVAILABLE_SKILL_TYPES.join(", ")}`,
    );
  }
  return value as SkillType;
}
