import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { createSessionProvider } from "../src/adapters/registry.js";
import { CliUsageError, OpenCodeAdapterError } from "../src/shared/errors.js";

const ORIGINAL_ADAPTER = process.env.SESSION2SKILLS_ADAPTER;
const ORIGINAL_DB_PATH = process.env.SESSION2SKILLS_DB_PATH;

afterEach(() => {
  restoreEnv("SESSION2SKILLS_ADAPTER", ORIGINAL_ADAPTER);
  restoreEnv("SESSION2SKILLS_DB_PATH", ORIGINAL_DB_PATH);
});

describe("createSessionProvider", () => {
  it("rejects unknown SESSION2SKILLS_ADAPTER values", async () => {
    process.env.SESSION2SKILLS_ADAPTER = "sqltie";

    await expect(
      createSessionProvider({ directory: "/tmp" }),
    ).rejects.toThrow(CliUsageError);
    await expect(
      createSessionProvider({ directory: "/tmp" }),
    ).rejects.toThrow("Expected \"sdk\" or \"sqlite\"");
  });

  it("eagerly validates the sqlite adapter when explicitly selected", async () => {
    process.env.SESSION2SKILLS_ADAPTER = "sqlite";
    process.env.SESSION2SKILLS_DB_PATH = join(tmpdir(), "session2skills-missing-opencode.db");

    await expect(
      createSessionProvider({ directory: "/tmp" }),
    ).rejects.toThrow(OpenCodeAdapterError);
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
