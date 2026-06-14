import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeHarnessGeneratedArtifacts } from "../../src/persist/generated-artifacts.js";
import type { ClaimManifest } from "../../src/harness/types.js";
import {
  makeClaimManifest,
  makeManifestClaim,
  makeSkepticReport,
  makeVerifierReport,
  makeWriterOutput,
} from "../harness/fixtures.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "s2k-persist-"));
}

const VALID_SKILL = "---\nname: test-skill\ndescription: A test skill for persist tests.\n---\n\n# Test Skill\n\nSome content.\n";

describe("writeHarnessGeneratedArtifacts", () => {
  it("embeds evidence excerpts in claim-manifest.json when present on manifest", async () => {
    const outDir = await makeTempDir();
    try {
      const manifest: ClaimManifest = makeClaimManifest({
        claims: [makeManifestClaim({ evidenceRefs: ["ev_001", "ev_002"] })],
        evidence: [
          { evidenceID: "ev_001", sourceType: "message", excerpt: "Read files first" },
          { evidenceID: "ev_002", sourceType: "tool", excerpt: "Ran tests" },
        ],
      });

      const paths = await writeHarnessGeneratedArtifacts({
        outputDirectory: outDir,
        summary: "summary",
        skill: VALID_SKILL,
        claimManifest: manifest,
        skepticReport: makeSkepticReport(),
        verifierReport: makeVerifierReport(),
        force: false,
      });

      const written = JSON.parse(await readFile(paths.claimManifestPath, "utf8")) as ClaimManifest;

      expect(written.evidence).toBeDefined();
      expect(Array.isArray(written.evidence)).toBe(true);
      expect(written.evidence).toHaveLength(2);
      expect(written.evidence!.map((e) => e.evidenceID).sort()).toEqual(["ev_001", "ev_002"]);
      expect(written.evidence![0]).toMatchObject({
        evidenceID: "ev_001",
        sourceType: "message",
        excerpt: "Read files first",
      });
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("produces a self-contained manifest: every evidenceRef has a matching excerpt", async () => {
    const outDir = await makeTempDir();
    try {
      const manifest: ClaimManifest = makeClaimManifest({
        claims: [
          makeManifestClaim({ id: "c1", evidenceRefs: ["ev_001", "ev_002"] }),
          makeManifestClaim({ id: "c2", evidenceRefs: ["ev_003"] }),
        ],
        evidence: [
          { evidenceID: "ev_001", sourceType: "message", excerpt: "a" },
          { evidenceID: "ev_002", sourceType: "tool", excerpt: "b" },
          { evidenceID: "ev_003", sourceType: "part", excerpt: "c" },
        ],
      });

      const paths = await writeHarnessGeneratedArtifacts({
        outputDirectory: outDir,
        summary: "summary",
        skill: VALID_SKILL,
        claimManifest: manifest,
        skepticReport: makeSkepticReport(),
        verifierReport: makeVerifierReport(),
        force: false,
      });

      const written = JSON.parse(await readFile(paths.claimManifestPath, "utf8")) as ClaimManifest;

      const referencedIds = new Set<string>();
      for (const claim of written.claims) {
        for (const ref of claim.evidenceRefs) referencedIds.add(ref);
      }
      const excerptIds = new Set(written.evidence!.map((e) => e.evidenceID));

      for (const refId of referencedIds) {
        expect(excerptIds.has(refId)).toBe(true);
      }
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("still works when evidence field is absent (backward compatible)", async () => {
    const outDir = await makeTempDir();
    try {
      const manifest: ClaimManifest = makeClaimManifest();

      const paths = await writeHarnessGeneratedArtifacts({
        outputDirectory: outDir,
        summary: "summary",
        skill: VALID_SKILL,
        claimManifest: manifest,
        skepticReport: makeSkepticReport(),
        verifierReport: makeVerifierReport(),
        force: false,
      });

      const written = JSON.parse(await readFile(paths.claimManifestPath, "utf8")) as ClaimManifest;
      expect(written.evidence).toBeUndefined();
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
