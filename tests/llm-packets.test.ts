import { describe, expect, it } from "vitest";

import type { EvidenceItem, NormalizedSession, WorkflowSignalKind } from "../src/normalize/models.js";
import {
  buildSessionMapPacket,
  buildCategoryReducePacket,
} from "../src/llm/packets.js";

// ---------------------------------------------------------------------------
// Inline factories
// ---------------------------------------------------------------------------

function makeEvidenceItem(
  id: string,
  dimension: WorkflowSignalKind | Array<WorkflowSignalKind> = "work-style",
  overrides: Record<string, unknown> = {},
): EvidenceItem {
  const dimensions = Array.isArray(dimension) ? dimension : [dimension];
  return {
    schemaVersion: "evidence-item/v1",
    evidenceID: id,
    citation: {
      sessionID: `ses_${id}`,
      messageID: `msg_${id}`,
      partID: `part_${id}`,
      sourceType: "message",
      evidenceID: id,
      ...overrides,
    },
    summaryText: `Evidence ${id}`,
    dimensions,
  } as EvidenceItem;
}

function makeSession(overrides: Partial<NormalizedSession> = {}): NormalizedSession {
  return {
    id: "ses_001",
    title: "Test session",
    directory: "/test",
    updatedAt: Date.now(),
    messages: [],
    toolInvocations: [],
    steps: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildSessionMapPacket
// ---------------------------------------------------------------------------

describe("buildSessionMapPacket", () => {
  it("returns a packet with all required fields", () => {
    const session = makeSession();
    const evidence = [makeEvidenceItem("ev1")];
    const packet = buildSessionMapPacket(session, evidence, 4000);

    expect(packet.promptID).toBe("session-extract-claims");
    expect(typeof packet.promptVersion).toBe("string");
    expect(typeof packet.systemPrompt).toBe("string");
    expect(packet.systemPrompt.length).toBeGreaterThan(0);
    expect(typeof packet.userPayload).toBe("string");
    expect(packet.userPayload.length).toBeGreaterThan(0);
    expect(packet.outputSchema).toBeDefined();
    expect(Array.isArray(packet.includedEvidenceIDs)).toBe(true);
    expect(packet.metadata).toBeDefined();
    expect(packet.metadata.sessionID).toBe("ses_001");
  });

  it("includes session header in userPayload", () => {
    const session = makeSession({ id: "ses_42", title: "My Session" });
    const packet = buildSessionMapPacket(session, [], 4000);

    expect(packet.userPayload).toContain("ses_42");
    expect(packet.userPayload).toContain("My Session");
  });

  it("includes evidence IDs when budget allows", () => {
    const evidence = [
      makeEvidenceItem("ev1"),
      makeEvidenceItem("ev2"),
      makeEvidenceItem("ev3"),
    ];
    const packet = buildSessionMapPacket(makeSession(), evidence, 50000);

    expect(packet.includedEvidenceIDs).toHaveLength(3);
    expect(packet.includedEvidenceIDs).toContain("ev1");
    expect(packet.includedEvidenceIDs).toContain("ev2");
    expect(packet.includedEvidenceIDs).toContain("ev3");
  });

  it("trims evidence when budget is tight", () => {
    const evidence = Array.from({ length: 50 }, (_, i) =>
      makeEvidenceItem(`ev${i}`, "work-style", { summaryText: "x".repeat(100) }),
    );
    const packet = buildSessionMapPacket(makeSession(), evidence, 500);

    expect(packet.includedEvidenceIDs.length).toBeLessThan(50);
  });

  it("handles empty evidence array", () => {
    const packet = buildSessionMapPacket(makeSession(), [], 4000);

    expect(packet.includedEvidenceIDs).toHaveLength(0);
    expect(packet.metadata.evidenceCount).toBe(0);
  });

  it("is deterministic — same input produces same output", () => {
    const session = makeSession({ id: "ses_det" });
    const evidence = [makeEvidenceItem("ev_a"), makeEvidenceItem("ev_b")];

    const p1 = buildSessionMapPacket(session, evidence, 4000);
    const p2 = buildSessionMapPacket(session, evidence, 4000);

    expect(p1.userPayload).toBe(p2.userPayload);
    expect(p1.includedEvidenceIDs).toEqual(p2.includedEvidenceIDs);
  });

  it("uses fallback system prompt when no registry provided", () => {
    const packet = buildSessionMapPacket(makeSession(), [], 4000);

    expect(packet.systemPrompt).toContain("developer behavior analyst");
    expect(packet.promptVersion).toBe("0.0.0");
  });

  it("tracks token estimate and budget in metadata", () => {
    const packet = buildSessionMapPacket(makeSession(), [makeEvidenceItem("ev1")], 4000);

    expect(packet.metadata.budget).toBe(4000);
    expect(typeof packet.metadata.tokenEstimate).toBe("number");
    expect(packet.metadata.tokenEstimate).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildCategoryReducePacket
// ---------------------------------------------------------------------------

describe("buildCategoryReducePacket", () => {
  it("returns a packet with all required fields", () => {
    const evidence = [makeEvidenceItem("ev1", "work-style")];
    const packet = buildCategoryReducePacket(evidence, "work-style", 4000);

    expect(packet.promptID).toBe("category-synthesize-claims");
    expect(typeof packet.promptVersion).toBe("string");
    expect(typeof packet.systemPrompt).toBe("string");
    expect(typeof packet.userPayload).toBe("string");
    expect(packet.outputSchema).toBeDefined();
    expect(Array.isArray(packet.includedEvidenceIDs)).toBe(true);
    expect(packet.metadata.dimension).toBe("work-style");
  });

  it("partitions evidence into primary and counter by dimension", () => {
    const evidence = [
      makeEvidenceItem("ev1", "work-style"),
      makeEvidenceItem("ev2", "communication-style"),
      makeEvidenceItem("ev3", "work-style"),
      makeEvidenceItem("ev4", "constraint"),
    ];
    const packet = buildCategoryReducePacket(evidence, "work-style", 50000);

    // ev1 and ev3 are primary (work-style), ev2 and ev4 are counter
    expect(packet.includedEvidenceIDs).toContain("ev1");
    expect(packet.includedEvidenceIDs).toContain("ev3");
    expect(packet.includedEvidenceIDs).toContain("ev2");
    expect(packet.includedEvidenceIDs).toContain("ev4");
  });

  it("includes primary evidence in userPayload", () => {
    const evidence = [makeEvidenceItem("ev1", "communication-style")];
    const packet = buildCategoryReducePacket(evidence, "communication-style", 50000);

    expect(packet.userPayload).toContain("Supporting Evidence");
  });

  it("includes counter-evidence section when present", () => {
    const evidence = [
      makeEvidenceItem("ev1", "work-style"),
      makeEvidenceItem("ev2", "communication-style"),
    ];
    const packet = buildCategoryReducePacket(evidence, "work-style", 50000);

    expect(packet.userPayload).toContain("Counter-Evidence");
  });

  it("omits counter-evidence section when none present", () => {
    const evidence = [makeEvidenceItem("ev1", "work-style")];
    const packet = buildCategoryReducePacket(evidence, "work-style", 50000);

    expect(packet.userPayload).not.toContain("Counter-Evidence");
  });

  it("handles empty evidence array", () => {
    const packet = buildCategoryReducePacket([], "validation-habit", 4000);

    expect(packet.includedEvidenceIDs).toHaveLength(0);
    expect(packet.metadata.evidenceCount).toBe(0);
    expect(packet.metadata.sessionIDs).toHaveLength(0);
  });

  it("extracts unique sorted sessionIDs from evidence", () => {
    const evidence = [
      makeEvidenceItem("ev1", "work-style"),
      makeEvidenceItem("ev2", "work-style"),
    ];
    // Override sessionIDs
    evidence[0].citation.sessionID = "ses_b";
    evidence[1].citation.sessionID = "ses_a";

    const packet = buildCategoryReducePacket(evidence, "work-style", 50000);

    expect(packet.metadata.sessionIDs).toEqual(["ses_a", "ses_b"]);
  });

  it("is deterministic — same input produces same output", () => {
    const evidence = [makeEvidenceItem("ev1", "constraint"), makeEvidenceItem("ev2", "constraint")];

    const p1 = buildCategoryReducePacket(evidence, "constraint", 4000);
    const p2 = buildCategoryReducePacket(evidence, "constraint", 4000);

    expect(p1.userPayload).toBe(p2.userPayload);
    expect(p1.includedEvidenceIDs).toEqual(p2.includedEvidenceIDs);
  });

  it("uses fallback system prompt when no registry provided", () => {
    const packet = buildCategoryReducePacket([], "work-style", 4000);

    expect(packet.systemPrompt).toContain("category-level synthesis");
    expect(packet.promptVersion).toBe("0.0.0");
  });
});
