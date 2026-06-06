import { describe, expect, it, beforeEach } from "vitest";

import { resetClaimCounter } from "../src/analyze/helpers.js";
import { extractValidationHabitClaims } from "../src/analyze/extract-validation-habits.js";
import type { NormalizedSession, ToolInvocation } from "../src/normalize/models.js";

function makeTool(name: string, input?: Record<string, unknown>, output?: string): ToolInvocation {
  return {
    id: `tool_${name}`,
    toolName: name,
    status: "completed",
    input,
    output,
    evidence: { sessionID: "ses_1", sourceType: "tool" },
  };
}

function makeSession(tools: Array<ToolInvocation>): NormalizedSession {
  return {
    id: "ses_1",
    title: "test",
    directory: "/test",
    updatedAt: Date.now(),
    messages: [],
    toolInvocations: tools,
    steps: [],
  };
}

describe("extractValidationHabitClaims", () => {
  beforeEach(() => resetClaimCounter());

  it("detects run-tests from tool name", () => {
    const claims = extractValidationHabitClaims([makeSession([makeTool("bash", { command: "npm run test" })])]);
    const rt = claims.find((c) => c.label === "run-tests");
    expect(rt).toBeDefined();
    expect(rt!.rationale).toContain("Test execution");
  });

  it("detects run-tests from vitest command", () => {
    const claims = extractValidationHabitClaims([makeSession([makeTool("bash", { command: "vitest run" })])]);
    const rt = claims.find((c) => c.label === "run-tests");
    expect(rt).toBeDefined();
  });

  it("detects run-diagnostics from typecheck command", () => {
    const claims = extractValidationHabitClaims([makeSession([makeTool("bash", { command: "tsc --noEmit" })])]);
    const rd = claims.find((c) => c.label === "run-diagnostics");
    expect(rd).toBeDefined();
  });

  it("detects run-diagnostics from lsp_diagnostics tool name", () => {
    const claims = extractValidationHabitClaims([makeSession([makeTool("lsp_diagnostics")])]);
    const rd = claims.find((c) => c.label === "run-diagnostics");
    expect(rd).toBeDefined();
  });

  it("detects check-git-state from git status", () => {
    const claims = extractValidationHabitClaims([makeSession([makeTool("bash", { command: "git status" })])]);
    const gs = claims.find((c) => c.label === "check-git-state");
    expect(gs).toBeDefined();
  });

  it("detects check-git-state from git diff", () => {
    const claims = extractValidationHabitClaims([makeSession([makeTool("bash", { command: "git diff" })])]);
    const gs = claims.find((c) => c.label === "check-git-state");
    expect(gs).toBeDefined();
  });

  it("returns empty claims for sessions with no matching tools", () => {
    const claims = extractValidationHabitClaims([makeSession([makeTool("edit"), makeTool("read")])]);
    expect(claims).toHaveLength(0);
  });

  it("returns empty claims for sessions with no tool invocations", () => {
    const claims = extractValidationHabitClaims([makeSession([])]);
    expect(claims).toHaveLength(0);
  });

  it("produces claims with correct dimension and source", () => {
    const claims = extractValidationHabitClaims([makeSession([makeTool("bash", { command: "npm run test" })])]);
    expect(claims[0].dimension).toBe("validation-habit");
    expect(claims[0].source.type).toBe("rule");
  });

  it("detects multiple validation types in the same session", () => {
    const claims = extractValidationHabitClaims([makeSession([
      makeTool("bash", { command: "npm run test" }),
      makeTool("bash", { command: "git diff" }),
      makeTool("lsp_diagnostics"),
    ])]);
    expect(claims.length).toBeGreaterThanOrEqual(3);
  });
});
