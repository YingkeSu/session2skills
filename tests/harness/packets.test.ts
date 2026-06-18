import { describe, it, expect } from "vitest";
import { buildAnalystPacket, buildVerifierPacket, buildWriterPacket } from "../../src/harness/packets.js";
import { buildEvidenceIndex, makeEvidenceID } from "../../src/harness/evidence-index.js";
import { makeEvidenceItems, makeEvidenceItem, makeClaimManifest, makeManifestClaim } from "./fixtures.js";
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

describe("buildWriterPacket", () => {
  it("includes evidenceRefs and evidenceExcerpts for each claim when evidence provided", () => {
    const evidence = [
      makeEvidenceItem({
        evidenceID: "ev_001",
        citation: {
          evidenceID: "ev_001",
          sessionID: "ses_001",
          sourceType: "message",
        },
        summaryText: "User asks for analysis before editing any code.",
      }),
      makeEvidenceItem({
        evidenceID: "ev_002",
        citation: {
          evidenceID: "ev_002",
          sessionID: "ses_001",
          sourceType: "tool",
        },
        summaryText: "Ran the full test suite immediately after changes.",
      }),
    ];

    const manifest = makeClaimManifest({
      claims: [
        makeManifestClaim({
          id: "claim_001",
          evidenceRefs: ["ev_001", "ev_002"],
        }),
      ],
    });

    const packet = buildWriterPacket(manifest, "balanced", undefined, evidence);

    const userMessage = packet.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();

    const jsonBlockMatch = userMessage!.content.match(/```json\n([\s\S]*?)\n```/);
    expect(jsonBlockMatch).not.toBeNull();
    const parsed = JSON.parse(jsonBlockMatch![1]!);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);

    const claim = parsed[0];
    expect(claim).toHaveProperty("evidenceRefs");
    expect(claim.evidenceRefs).toEqual(["ev_001", "ev_002"]);
    expect(claim).toHaveProperty("evidenceExcerpts");
    expect(Array.isArray(claim.evidenceExcerpts)).toBe(true);
    expect(claim.evidenceExcerpts).toHaveLength(2);

    const excerpt0 = claim.evidenceExcerpts[0];
    expect(excerpt0.id).toBe("ev_001");
    expect(excerpt0.sourceType).toBe("message");
    expect(excerpt0.excerpt).toContain("User asks for analysis before editing");

    const excerpt1 = claim.evidenceExcerpts[1];
    expect(excerpt1.id).toBe("ev_002");
    expect(excerpt1.sourceType).toBe("tool");
    expect(excerpt1.excerpt).toContain("Ran the full test suite");
  });

  it("truncates evidence excerpts to ~200 chars", () => {
    const longText = "x".repeat(500);
    const evidence = [
      makeEvidenceItem({
        evidenceID: "ev_long",
        citation: { evidenceID: "ev_long", sessionID: "ses_001", sourceType: "message" },
        summaryText: longText,
      }),
    ];

    const manifest = makeClaimManifest({
      claims: [makeManifestClaim({ id: "claim_001", evidenceRefs: ["ev_long"] })],
    });

    const packet = buildWriterPacket(manifest, "balanced", undefined, evidence);

    const userMessage = packet.messages.find((m) => m.role === "user");
    const jsonBlockMatch = userMessage!.content.match(/```json\n([\s\S]*?)\n```/);
    const parsed = JSON.parse(jsonBlockMatch![1]!);
    const excerpt = parsed[0].evidenceExcerpts[0].excerpt as string;
    expect(excerpt.length).toBeLessThanOrEqual(203);
    expect(excerpt.endsWith("...")).toBe(true);
  });

  it("degrades gracefully when evidence is undefined (no crash, no evidenceExcerpts)", () => {
    const manifest = makeClaimManifest({
      claims: [makeManifestClaim({ id: "claim_001", evidenceRefs: ["ev_001"] })],
    });

    const packet = buildWriterPacket(manifest, "balanced", undefined);

    const userMessage = packet.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();

    const jsonBlockMatch = userMessage!.content.match(/```json\n([\s\S]*?)\n```/);
    expect(jsonBlockMatch).not.toBeNull();
    const parsed = JSON.parse(jsonBlockMatch![1]!);

    expect(parsed[0]).toHaveProperty("evidenceRefs");
    expect(parsed[0].evidenceRefs).toEqual(["ev_001"]);
    expect(parsed[0]).not.toHaveProperty("evidenceExcerpts");
  });

  it("degrades gracefully when evidence array is empty", () => {
    const manifest = makeClaimManifest({
      claims: [makeManifestClaim({ id: "claim_001", evidenceRefs: ["ev_001"] })],
    });

    const packet = buildWriterPacket(manifest, "balanced", undefined, []);

    const userMessage = packet.messages.find((m) => m.role === "user");
    const jsonBlockMatch = userMessage!.content.match(/```json\n([\s\S]*?)\n```/);
    const parsed = JSON.parse(jsonBlockMatch![1]!);
    expect(parsed[0]).not.toHaveProperty("evidenceExcerpts");
  });

  it("resolves only excerpts for referenced evidence IDs, skipping unknown refs", () => {
    const evidence = [
      makeEvidenceItem({
        evidenceID: "ev_known",
        citation: { evidenceID: "ev_known", sessionID: "ses_001", sourceType: "message" },
        summaryText: "Known evidence text.",
      }),
    ];

    const manifest = makeClaimManifest({
      claims: [
        makeManifestClaim({
          id: "claim_001",
          evidenceRefs: ["ev_known", "ev_unknown"],
        }),
      ],
    });

    const packet = buildWriterPacket(manifest, "balanced", undefined, evidence);

    const userMessage = packet.messages.find((m) => m.role === "user");
    const jsonBlockMatch = userMessage!.content.match(/```json\n([\s\S]*?)\n```/);
    const parsed = JSON.parse(jsonBlockMatch![1]!);
    expect(parsed[0].evidenceExcerpts).toHaveLength(1);
    expect(parsed[0].evidenceExcerpts[0].id).toBe("ev_known");
  });

  it("fallback system prompt includes grounding density instructions", () => {
    const manifest = makeClaimManifest();
    const packet = buildWriterPacket(manifest, "balanced", undefined);

    const systemMessage = packet.messages.find((m) => m.role === "system");
    expect(systemMessage).toBeDefined();
    expect(systemMessage!.content).toContain("anchor each directive to the observed pattern");
    expect(systemMessage!.content).toContain("Prefer behavioral translations over abstract labels");
  });

  it("includes skillTypeFocus in instructions when provided", () => {
    const manifest = makeClaimManifest();
    const packet = buildWriterPacket(manifest, "balanced", undefined, undefined, undefined, "testing practices, validation habits");

    const userMessage = packet.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();
    expect(userMessage!.content).toContain("focused on testing practices, validation habits");
  });

  it("uses default instructions when skillTypeFocus is undefined", () => {
    const manifest = makeClaimManifest();
    const packet = buildWriterPacket(manifest, "balanced", undefined);

    const userMessage = packet.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();
    expect(userMessage!.content).toContain("Write installable-style SKILL.md guidance");
  });
});

describe("buildAnalystPacket with selectedDimensions", () => {
  it("analyst packet only includes selected dimensions in taxonomy", () => {
    const evidence = makeEvidenceItems(3);
    const selectedDimensions = ["validation-habit", "constraint"];
    const packet = buildAnalystPacket(mockSessions, evidence, undefined, 6000, selectedDimensions);

    const userMessage = packet.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();

    expect(userMessage!.content).toContain("### validation-habit");
    expect(userMessage!.content).toContain("### constraint");
    expect(userMessage!.content).not.toContain("### work-style");
    expect(userMessage!.content).not.toContain("### communication-style");
    expect(userMessage!.content).not.toContain("### token-efficiency");
    expect(userMessage!.content).not.toContain("### model-selection");
    expect(userMessage!.content).not.toContain("### delegation-pattern");
  });

  it("analyst packet includes all dimensions when selectedDimensions is undefined", () => {
    const evidence = makeEvidenceItems(3);
    const packet = buildAnalystPacket(mockSessions, evidence);

    const userMessage = packet.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();

    expect(userMessage!.content).toContain("### work-style");
    expect(userMessage!.content).toContain("### communication-style");
    expect(userMessage!.content).toContain("### validation-habit");
    expect(userMessage!.content).toContain("### constraint");
    expect(userMessage!.content).toContain("### token-efficiency");
    expect(userMessage!.content).toContain("### model-selection");
    expect(userMessage!.content).toContain("### delegation-pattern");
  });
});
