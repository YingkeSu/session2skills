import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

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
});
