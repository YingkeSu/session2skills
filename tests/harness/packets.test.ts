import { describe, it, expect } from "vitest";
import { buildAnalystPacket, buildVerifierPacket } from "../../src/harness/packets.js";
import { buildEvidenceIndex, makeEvidenceID } from "../../src/analyze/evidence-index.js";
import { makeEvidenceItems, makeClaimManifest, makeManifestClaim } from "./fixtures.js";
import type { NormalizedSession } from "../../src/normalize/models.js";

const mockSessions: Array<NormalizedSession> = [
  {
    id: "ses_001",
    title: "Test session",
    directory: "/test",
    updatedAt: Date.now(),
    messages: [
      {
        id: "msg_001",
        role: "user",
        timestamp: Date.now(),
        text: "fix the bug",
        parts: [],
        toolInvocations: [],
        evidence: { sessionID: "ses_001", sourceType: "message" },
      },
    ],
    toolInvocations: [],
    steps: [],
  },
];

describe("buildAnalystPacket", () => {
  it("instruction uses correct evidence ID format", () => {
    const realEvidence = buildEvidenceIndex(mockSessions);
    const realIds = realEvidence.map((e) => e.evidenceID);
    expect(realIds.length).toBeGreaterThan(0);
    for (const id of realIds) {
      expect(id).toContain(":");
    }

    const evidence = makeEvidenceItems(3);
    const packet = buildAnalystPacket(mockSessions, evidence);

    const userMessage = packet.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();

    const citeInstructionLine = userMessage!.content
      .split("\n")
      .find((line) => line.includes("Cite evidence IDs"));
    expect(citeInstructionLine).toBeDefined();

    const realExample = makeEvidenceID("ses_001", "msg_001", "part_001");
    expect(citeInstructionLine!).toContain(realExample);
    expect(citeInstructionLine!).not.toMatch(/ev_001/);
  });
});

describe("buildVerifierPacket", () => {
  it("includes evidenceRefs and rationale for each manifest claim", () => {
    const manifest = makeClaimManifest({
      claims: [
        makeManifestClaim({
          id: "claim_001",
          dimension: "work-style",
          label: "analysis-first",
          confidence: 0.85,
          rationale: "The user consistently inspects code before editing.",
          evidenceRefs: ["ses_001:msg_001", "ses_001:msg_002"],
        }),
      ],
    });

    const packet = buildVerifierPacket("# Sample SKILL", manifest);

    const userMessage = packet.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();

    const jsonBlockMatch = userMessage!.content.match(/```json\n([\s\S]*?)\n```/);
    expect(jsonBlockMatch).not.toBeNull();
    const parsed = JSON.parse(jsonBlockMatch![1]!);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);

    const claim = parsed[0];
    expect(claim).toHaveProperty("id", "claim_001");
    expect(claim).toHaveProperty("dimension", "work-style");
    expect(claim).toHaveProperty("label", "analysis-first");
    expect(claim).toHaveProperty("confidence", 0.85);
    expect(claim).toHaveProperty("rationale", "The user consistently inspects code before editing.");
    expect(claim).toHaveProperty("evidenceRefs");
    expect(claim.evidenceRefs).toEqual(["ses_001:msg_001", "ses_001:msg_002"]);
  });
});
