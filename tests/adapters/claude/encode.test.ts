import { describe, expect, it } from "vitest";

import { encodeCwd, matchesEncodedCwd } from "../../../src/adapters/claude/encode.js";

describe("encodeCwd", () => {
  it("encodes a standard macOS path", () => {
    expect(encodeCwd("/Users/alice/my-project")).toBe("-Users-alice-my-project");
  });

  it("encodes a linux home path", () => {
    expect(encodeCwd("/home/bob/workspace/api")).toBe("-home-bob-workspace-api");
  });

  it("collapses spaces to dashes", () => {
    expect(encodeCwd("/Users/alice/my project")).toBe("-Users-alice-my-project");
  });

  it("collapses dots to dashes", () => {
    expect(encodeCwd("/Users/alice/my.project")).toBe("-Users-alice-my-project");
  });

  it("collapses underscores to dashes", () => {
    expect(encodeCwd("/Users/alice/my_project")).toBe("-Users-alice-my-project");
  });

  it("collapses multiple special chars to consecutive dashes", () => {
    expect(encodeCwd("/Users/alice/a b.c_d")).toBe("-Users-alice-a-b-c-d");
  });

  it("encodes root slash as a single dash", () => {
    expect(encodeCwd("/")).toBe("-");
  });

  it("preserves digits and uppercase", () => {
    expect(encodeCwd("/Users/Alice123/Project")).toBe("-Users-Alice123-Project");
  });
});

describe("matchesEncodedCwd", () => {
  it("returns true when cwd encodes to the directory name", () => {
    expect(matchesEncodedCwd("-Users-alice-my-project", "/Users/alice/my-project")).toBe(true);
  });

  it("returns false when cwd encodes to a different name", () => {
    expect(matchesEncodedCwd("-Users-bob-other", "/Users/alice/my-project")).toBe(false);
  });

  it("returns true for a lossy collision (same encoded form)", () => {
    expect(matchesEncodedCwd("-Users-alice-my-project", "/Users/alice/my project")).toBe(true);
  });
});
