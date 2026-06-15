import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { writeSkillToStore, validateSkillID } from "../src/persist/skill-store.js";
import type { SkillManifest, SkillProvenance } from "../src/persist/skill-store.js";
import { CliUsageError } from "../src/shared/errors.js";
import { getDefaultSkillStoreRoot, getActiveSkillPath } from "../src/shared/paths.js";

async function tmpDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "session2skills-skill-store-"));
}

const VALID_SKILL = `---
name: test-skill
description: Use when testing skill store persistence.
---

# Test Skill
`;

function makeManifest(overrides?: Partial<SkillManifest>): SkillManifest {
  return {
    schemaVersion: "skill-manifest/v1",
    skillID: "test-skill",
    name: "Test Skill",
    description: "Use when testing skill store persistence.",
    generatedAt: new Date().toISOString(),
    status: "active",
    files: ["SKILL.md", "skill-manifest.json"],
    ...overrides,
  };
}

function makeProvenance(overrides?: Partial<SkillProvenance>): SkillProvenance {
  return {
    schemaVersion: "skill-provenance/v1",
    skillID: "test-skill",
    sourceSessionIDs: ["ses_001", "ses_002"],
    sourceDirectory: "/project",
    generatedAt: new Date().toISOString(),
    claimIDs: ["claim-1", "claim-2"],
    ...overrides,
  };
}

describe("skill-store", () => {
  it("writes SKILL.md and skill-manifest.json", async () => {
    const storeRoot = await tmpDir();
    const result = await writeSkillToStore({
      storeRoot,
      skillID: "test-skill",
      skillMarkdown: VALID_SKILL,
      manifest: makeManifest(),
      force: false,
    });

    expect(result.skillPath).toContain("SKILL.md");
    expect(result.manifestPath).toContain("skill-manifest.json");
    expect(result.provenancePath).toBeNull();
    expect(result.skillIntentPath).toBeNull();
    expect(result.lineagePath).toBeNull();

    const skillContent = await readFile(result.skillPath, "utf8");
    expect(skillContent).toBe(VALID_SKILL);

    const manifestContent = JSON.parse(await readFile(result.manifestPath, "utf8"));
    expect(manifestContent.schemaVersion).toBe("skill-manifest/v1");
    expect(manifestContent.skillID).toBe("test-skill");
  });

  it("writes optional metadata when provided", async () => {
    const storeRoot = await tmpDir();
    const result = await writeSkillToStore({
      storeRoot,
      skillID: "full-skill",
      skillMarkdown: VALID_SKILL,
      manifest: makeManifest({ skillID: "full-skill" }),
      provenance: makeProvenance({ skillID: "full-skill" }),
      skillIntent: { schemaVersion: "skill-intent/v1", name: "full-skill" },
      lineage: { schemaVersion: "lineage/v1", parentID: "old-skill" },
      force: false,
    });

    expect(result.provenancePath).not.toBeNull();
    expect(result.provenancePath).toContain("provenance.json");
    expect(result.skillIntentPath).not.toBeNull();
    expect(result.skillIntentPath).toContain("skill-intent.json");
    expect(result.lineagePath).not.toBeNull();
    expect(result.lineagePath).toContain("lineage.json");

    const provenance = JSON.parse(await readFile(result.provenancePath!, "utf8"));
    expect(provenance.schemaVersion).toBe("skill-provenance/v1");

    const intent = JSON.parse(await readFile(result.skillIntentPath!, "utf8"));
    expect(intent.schemaVersion).toBe("skill-intent/v1");

    const lineage = JSON.parse(await readFile(result.lineagePath!, "utf8"));
    expect(lineage.schemaVersion).toBe("lineage/v1");
  });

  it("manifest contains correct schema version and files list", async () => {
    const storeRoot = await tmpDir();
    const manifest = makeManifest({
      skillID: "manifest-test",
      files: ["SKILL.md", "skill-manifest.json", "provenance.json"],
    });

    const result = await writeSkillToStore({
      storeRoot,
      skillID: "manifest-test",
      skillMarkdown: VALID_SKILL,
      manifest,
      provenance: makeProvenance({ skillID: "manifest-test" }),
      force: false,
    });

    const manifestContent = JSON.parse(await readFile(result.manifestPath, "utf8"));
    expect(manifestContent.schemaVersion).toBe("skill-manifest/v1");
    expect(manifestContent.files).toEqual(["SKILL.md", "skill-manifest.json", "provenance.json"]);
  });

  it("provenance contains correct schema version and source info", async () => {
    const storeRoot = await tmpDir();
    const provenance = makeProvenance({
      skillID: "prov-test",
      sourceSessionIDs: ["ses_100", "ses_200"],
      sourceDirectory: "/my/project",
      claimIDs: ["claim-a", "claim-b", "claim-c"],
    });

    const result = await writeSkillToStore({
      storeRoot,
      skillID: "prov-test",
      skillMarkdown: VALID_SKILL,
      manifest: makeManifest({ skillID: "prov-test" }),
      provenance,
      force: false,
    });

    const provenanceContent = JSON.parse(await readFile(result.provenancePath!, "utf8"));
    expect(provenanceContent.schemaVersion).toBe("skill-provenance/v1");
    expect(provenanceContent.skillID).toBe("prov-test");
    expect(provenanceContent.sourceSessionIDs).toEqual(["ses_100", "ses_200"]);
    expect(provenanceContent.sourceDirectory).toBe("/my/project");
    expect(provenanceContent.claimIDs).toEqual(["claim-a", "claim-b", "claim-c"]);
  });

  it("refuses overwrite without force and supports force", async () => {
    const storeRoot = await tmpDir();
    const skillID = "overwrite-test";

    await writeSkillToStore({
      storeRoot,
      skillID,
      skillMarkdown: VALID_SKILL,
      manifest: makeManifest({ skillID }),
      force: false,
    });

    await expect(
      writeSkillToStore({
        storeRoot,
        skillID,
        skillMarkdown: VALID_SKILL,
        manifest: makeManifest({ skillID }),
        force: false,
      }),
    ).rejects.toThrow(CliUsageError);

    const updatedSkill = VALID_SKILL.replace("# Test Skill", "# Updated Skill");
    const result = await writeSkillToStore({
      storeRoot,
      skillID,
      skillMarkdown: updatedSkill,
      manifest: makeManifest({ skillID }),
      force: true,
    });

    const content = await readFile(result.skillPath, "utf8");
    expect(content).toContain("# Updated Skill");
  });

  it("rejects invalid skill IDs", () => {
    expect(() => validateSkillID("")).toThrow(CliUsageError);
    expect(() => validateSkillID("foo/bar")).toThrow(CliUsageError);
    expect(() => validateSkillID("foo/../bar")).toThrow(CliUsageError);
    expect(() => validateSkillID(".hidden")).toThrow(CliUsageError);
    expect(() => validateSkillID("   ")).toThrow(CliUsageError);
    expect(() => validateSkillID("foo\\bar")).toThrow(CliUsageError);
  });

  it("writes to correct active/ layout", async () => {
    const storeRoot = await tmpDir();
    const result = await writeSkillToStore({
      storeRoot,
      skillID: "layout-test",
      skillMarkdown: VALID_SKILL,
      manifest: makeManifest({ skillID: "layout-test" }),
      force: false,
    });

    const expectedDir = path.join(storeRoot, "active", "layout-test");
    expect(result.skillPath).toBe(path.join(expectedDir, "SKILL.md"));
    expect(result.manifestPath).toBe(path.join(expectedDir, "skill-manifest.json"));
  });

  it("path helpers return correct values", () => {
    const root = "/project";
    expect(getDefaultSkillStoreRoot(root)).toBe(path.join(root, ".session2skills", "skills"));

    const storeRoot = getDefaultSkillStoreRoot(root);
    expect(getActiveSkillPath(storeRoot, "my-skill")).toBe(
      path.join(root, ".session2skills", "skills", "active", "my-skill"),
    );
  });
});
