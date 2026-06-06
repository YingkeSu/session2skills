import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CliUsageError } from "../src/shared/errors.js";
import { loadProfileFromFile } from "../src/shared/profile-io.js";
import { sampleProfile } from "./fixtures/sample-profile.js";

describe("loadProfileFromFile", () => {
  it("loads a saved profile.json file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-profile-"));
    const filePath = path.join(root, "profile.json");
    await writeFile(filePath, JSON.stringify(sampleProfile, null, 2), "utf8");

    const loaded = await loadProfileFromFile(filePath);

    expect(loaded).toEqual(sampleProfile);
  });

  it("fills extended signal arrays when loading an older legacy profile", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-profile-"));
    const filePath = path.join(root, "legacy-profile.json");
    const {
      tokenEfficiency: _tokenEfficiency,
      modelSelection: _modelSelection,
      delegationPattern: _delegationPattern,
      ...legacyProfile
    } = sampleProfile;

    await writeFile(filePath, JSON.stringify(legacyProfile, null, 2), "utf8");

    const loaded = await loadProfileFromFile(filePath);

    expect(loaded).toEqual(sampleProfile);
  });

  it("throws CliUsageError for non-existent file", async () => {
    await expect(loadProfileFromFile("/nonexistent/profile.json")).rejects.toThrow(CliUsageError);
    await expect(loadProfileFromFile("/nonexistent/profile.json")).rejects.toThrow("not found");
  });

  it("throws CliUsageError for invalid JSON", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-profile-"));
    const filePath = path.join(root, "bad.json");
    await writeFile(filePath, "{ invalid json }", "utf8");

    await expect(loadProfileFromFile(filePath)).rejects.toThrow(CliUsageError);
    await expect(loadProfileFromFile(filePath)).rejects.toThrow("Invalid JSON");
  });

  it("throws CliUsageError for a directory path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-profile-"));

    await expect(loadProfileFromFile(root)).rejects.toThrow(CliUsageError);
    await expect(loadProfileFromFile(root)).rejects.toThrow("Not a file");
  });

  it("throws CliUsageError when required arrays are missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-profile-"));
    const filePath = path.join(root, "incomplete.json");
    await writeFile(filePath, JSON.stringify({ workStyle: [], communicationStyle: [] }), "utf8");

    await expect(loadProfileFromFile(filePath)).rejects.toThrow(CliUsageError);
    await expect(loadProfileFromFile(filePath)).rejects.toThrow("missing required array");
  });

  it("throws CliUsageError for profile/v2 missing mergedClaims", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-profile-"));
    const filePath = path.join(root, "v2-incomplete.json");
    await writeFile(filePath, JSON.stringify({
      schemaVersion: "profile/v2",
      workStyle: [],
      communicationStyle: [],
      validationHabits: [],
      constraints: [],
      confidenceNotes: [],
      promptSetVersion: "prompt-set/v1",
      acceptedClaims: [],
      tentativeClaims: [],
    }), "utf8");

    await expect(loadProfileFromFile(filePath)).rejects.toThrow(CliUsageError);
    await expect(loadProfileFromFile(filePath)).rejects.toThrow("mergedClaims");
  });

  it("fills missing profile/v2 strongest signal dimensions from merged claims", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-profile-"));
    const filePath = path.join(root, "v2-profile.json");
    const profile = {
      schemaVersion: "profile/v2",
      promptSetVersion: "prompt-set/v1",
      workStyle: [],
      communicationStyle: [],
      validationHabits: [],
      constraints: [],
      confidenceNotes: [],
      tokenEfficiency: [],
      modelSelection: [],
      delegationPattern: [],
      acceptedClaims: [],
      tentativeClaims: [],
      unresolvedAreas: [],
      strongestSignals: {
        "work-style": [],
      },
      mergedClaims: [
        {
          schemaVersion: "merged-claim/v1",
          claimID: "merged:token-efficiency:analytical",
          dimension: "token-efficiency",
          label: "analytical",
          confidence: 0.8,
          rationale: "test",
          citations: [],
          sources: [],
        },
      ],
    };
    await writeFile(filePath, JSON.stringify(profile, null, 2), "utf8");

    const loaded = await loadProfileFromFile(filePath);

    expect("schemaVersion" in loaded && loaded.schemaVersion).toBe("profile/v2");
    if ("schemaVersion" in loaded && loaded.schemaVersion === "profile/v2") {
      expect(loaded.strongestSignals["token-efficiency"]).toHaveLength(1);
      expect(loaded.strongestSignals["model-selection"]).toEqual([]);
      expect(loaded.strongestSignals["delegation-pattern"]).toEqual([]);
    }
  });

  it("throws CliUsageError for invalid profile/v2 strongest signal dimensions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-profile-"));
    const filePath = path.join(root, "v2-invalid-strongest.json");
    await writeFile(filePath, JSON.stringify({
      schemaVersion: "profile/v2",
      promptSetVersion: "prompt-set/v1",
      workStyle: [],
      communicationStyle: [],
      validationHabits: [],
      constraints: [],
      confidenceNotes: [],
      tokenEfficiency: [],
      modelSelection: [],
      delegationPattern: [],
      acceptedClaims: [],
      tentativeClaims: [],
      unresolvedAreas: [],
      strongestSignals: {
        "token-efficiency": {},
      },
      mergedClaims: [],
    }), "utf8");

    await expect(loadProfileFromFile(filePath)).rejects.toThrow(CliUsageError);
    await expect(loadProfileFromFile(filePath)).rejects.toThrow("strongestSignals.token-efficiency");
  });
});
