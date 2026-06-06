import { describe, expect, it } from "vitest";

import type { NormalizedMessage, NormalizedSession } from "../src/normalize/models.js";
import { extractModelSelectionClaims } from "../src/analyze/extract-model-selection.js";

function makeSession(id: string, messages: Array<Partial<NormalizedMessage>>): NormalizedSession {
  return {
    id,
    title: `Session ${id}`,
    directory: "/test",
    updatedAt: Date.now(),
    messages: messages.map((m, i) => ({
      id: m.id ?? `msg_${i}`,
      role: m.role ?? "user",
      timestamp: Date.now(),
      text: m.text ?? "",
      parts: [],
      toolInvocations: [],
      evidence: { sessionID: id, sourceType: "message" },
      modelID: m.modelID,
    })),
    toolInvocations: [],
    steps: [],
  };
}

describe("extractModelSelectionClaims", () => {
  it("detects quality-focused pattern (frontier models only)", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", modelID: "claude-3-opus" },
        { role: "assistant", modelID: "claude-3-opus" },
        { role: "assistant", modelID: "claude-3-opus" },
      ]),
    ];

    const claims = extractModelSelectionClaims(sessions);
    const quality = claims.find((c) => c.label === "quality-focused");
    expect(quality).toBeDefined();
    expect(quality!.rationale).toContain("Tier-1");
  });

  it("detects cost-conscious pattern (budget models)", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", modelID: "claude-3-haiku" },
        { role: "assistant", modelID: "claude-3-haiku" },
        { role: "assistant", modelID: "gpt-4o-mini" },
      ]),
    ];

    const claims = extractModelSelectionClaims(sessions);
    const cost = claims.find((c) => c.label === "cost-conscious");
    expect(cost).toBeDefined();
    expect(cost!.rationale).toContain("Tier-2/3");
  });

  it("detects adaptive pattern (multiple tiers + switching)", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", modelID: "claude-3-opus" },
        { role: "assistant", modelID: "claude-3-haiku" },
        { role: "assistant", modelID: "claude-3-opus" },
        { role: "assistant", modelID: "claude-3-sonnet" },
      ]),
    ];

    const claims = extractModelSelectionClaims(sessions);
    const adaptive = claims.find((c) => c.label === "adaptive");
    expect(adaptive).toBeDefined();
    expect(adaptive!.rationale).toContain("Multiple model tiers");
  });

  it("returns no claims for sessions without modelID", () => {
    const sessions = [
      makeSession("s1", [{ role: "assistant" }]),
      makeSession("s2", [{ role: "user", text: "hello" }]),
    ];

    const claims = extractModelSelectionClaims(sessions);
    expect(claims).toHaveLength(0);
  });

  it("returns no claims for empty sessions array", () => {
    const claims = extractModelSelectionClaims([]);
    expect(claims).toHaveLength(0);
  });

  it("classifies unknown models as tier-2 by default", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", modelID: "some-unknown-model" },
        { role: "assistant", modelID: "another-unknown-model" },
      ]),
    ];

    const claims = extractModelSelectionClaims(sessions);
    // All tier-2 → cost-conscious (tier-2/3 ratio = 1.0)
    const cost = claims.find((c) => c.label === "cost-conscious");
    expect(cost).toBeDefined();
  });

  it("sorts claims by confidence descending", () => {
    const sessions = [
      makeSession("s1", [{ role: "assistant", modelID: "claude-3-opus" }]),
      makeSession("s2", [{ role: "assistant", modelID: "claude-3-opus" }]),
      makeSession("s3", [{ role: "user", text: "no model" }]),
    ];

    const claims = extractModelSelectionClaims(sessions);
    for (let i = 1; i < claims.length; i++) {
      expect(claims[i].confidence).toBeLessThanOrEqual(claims[i - 1].confidence);
    }
  });

  it("uses correct dimension and source", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", modelID: "claude-3-opus" },
        { role: "assistant", modelID: "claude-3-opus" },
        { role: "assistant", modelID: "claude-3-opus" },
      ]),
    ];

    const claims = extractModelSelectionClaims(sessions);
    for (const claim of claims) {
      expect(claim.dimension).toBe("model-selection");
      if (claim.source.type !== "rule") {
        throw new Error(`Expected rule source, received ${claim.source.type}`);
      }
      expect(claim.source.ruleID).toBe(`extract-model-selection/${claim.label}`);
    }
  });
});
