import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { ChangesetConfig } from "../../src/release/changeset-config.js";
import { parseWorkflowPermissions } from "../../src/release/workflow-parser.js";

const repoRoot = resolve(__dirname, "../..");

function readWorkflow(): string {
  return readFileSync(resolve(repoRoot, ".github/workflows/release.yml"), "utf8");
}

function readChangesetConfig(): ChangesetConfig {
  const raw = readFileSync(resolve(repoRoot, ".changeset/config.json"), "utf8");
  return JSON.parse(raw) as ChangesetConfig;
}

describe("release workflow (issue #50)", () => {
  it("reads a non-empty release.yml", () => {
    const yaml = readWorkflow();
    expect(yaml.length).toBeGreaterThan(0);
  });

  describe("Trusted Publishing permissions (OIDC, no hardcoded token)", () => {
    it("declares id-token: write", () => {
      const permissions = parseWorkflowPermissions(readWorkflow());
      expect(permissions["id-token"]).toBe("write");
    });

    it("declares contents: write (for changesets PR / tag)", () => {
      const permissions = parseWorkflowPermissions(readWorkflow());
      expect(permissions["contents"]).toBe("write");
    });

    it("declares pull-requests: write (for Version Packages PR)", () => {
      const permissions = parseWorkflowPermissions(readWorkflow());
      expect(permissions["pull-requests"]).toBe("write");
    });

    it("authenticates publish via the standard NODE_AUTH_TOKEN env (no long-lived plaintext token in the file)", () => {
      const yaml = readWorkflow();
      // The changesets/action + npm Trusted Publishing contract references
      // `NODE_AUTH_TOKEN` (the npm CLI's auth env var). The actual identity is
      // established via OIDC + the npm-side Trusted Publishing linkage — the
      // workflow file itself must never contain a plaintext token.
      expect(yaml).toContain("NODE_AUTH_TOKEN");
      // A plaintext token literal must never be checked in.
      expect(yaml).not.toMatch(/NODE_AUTH_TOKEN:\s*npm_/);
      expect(yaml).not.toMatch(/NPM_TOKEN:\s*npm_/);
    });
  });

  describe("publish contract", () => {
    it("uses the changesets/action", () => {
      const yaml = readWorkflow();
      expect(yaml).toMatch(/uses:\s+changesets\/action@v1/);
    });

    it("publishes with --provenance --access public", () => {
      const yaml = readWorkflow();
      // Either in the publish script string or as an env flag.
      expect(yaml).toContain("--provenance");
      expect(yaml).toContain("--access public");
    });

    it("enables provenance via env NPM_CONFIG_PROVENANCE=true", () => {
      const yaml = readWorkflow();
      expect(yaml).toContain("NPM_CONFIG_PROVENANCE");
      expect(yaml).toMatch(/NPM_CONFIG_PROVENANCE:\s*"?true"?/);
    });

    it("targets the npm public registry", () => {
      const yaml = readWorkflow();
      expect(yaml).toContain("registry-url: https://registry.npmjs.org");
    });

    it("uses setup-node v6", () => {
      const yaml = readWorkflow();
      expect(yaml).toMatch(/uses:\s+actions\/setup-node@v6/);
    });

    it("runs in the protected Release environment", () => {
      const yaml = readWorkflow();
      expect(yaml).toMatch(/environment:\s*Release/);
    });

    it("triggers on push to main", () => {
      const yaml = readWorkflow();
      expect(yaml).toMatch(/on:/);
      expect(yaml).toContain("branches: [main]");
    });
  });

  describe("changeset config (.changeset/config.json)", () => {
    it("has access: public", () => {
      const config = readChangesetConfig();
      expect(config.access).toBe("public");
    });

    it("has baseBranch: main", () => {
      const config = readChangesetConfig();
      expect(config.baseBranch).toBe("main");
    });

    it("uses the @changesets/cli changelog", () => {
      const config = readChangesetConfig();
      expect(config.changelog).toBe("@changesets/cli/changelog");
    });

    it("declares a sane updateInternalDependencies setting", () => {
      const config = readChangesetConfig();
      expect(["patch", "minor", "major"]).toContain(config.updateInternalDependencies);
    });
  });
});
