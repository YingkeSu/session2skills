import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { createSessionProvider } from "../src/adapters/registry.js";
import { CliUsageError, OpenCodeAdapterError } from "../src/shared/errors.js";

const ORIGINAL_ADAPTER = process.env.SESSION2SKILLS_ADAPTER;
const ORIGINAL_DB_PATH = process.env.SESSION2SKILLS_DB_PATH;
const ORIGINAL_CODEX_HOME = process.env.CODEX_HOME;
const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;

afterEach(() => {
  restoreEnv("SESSION2SKILLS_ADAPTER", ORIGINAL_ADAPTER);
  restoreEnv("SESSION2SKILLS_DB_PATH", ORIGINAL_DB_PATH);
  restoreEnv("CODEX_HOME", ORIGINAL_CODEX_HOME);
  restoreEnv("CLAUDE_CONFIG_DIR", ORIGINAL_CLAUDE_CONFIG_DIR);
});

describe("createSessionProvider", () => {
  it("rejects unknown SESSION2SKILLS_ADAPTER values", async () => {
    process.env.SESSION2SKILLS_ADAPTER = "sqltie";

    await expect(
      createSessionProvider({ directory: "/tmp" }),
    ).rejects.toThrow(CliUsageError);
    await expect(
      createSessionProvider({ directory: "/tmp" }),
    ).rejects.toThrow("Expected \"sdk\", \"sqlite\", \"codex\", or \"claude\"");
  });

  it("eagerly validates the sqlite adapter when explicitly selected", async () => {
    process.env.SESSION2SKILLS_ADAPTER = "sqlite";
    process.env.SESSION2SKILLS_DB_PATH = join(tmpdir(), "session2skills-missing-opencode.db");

    await expect(
      createSessionProvider({ directory: "/tmp" }),
    ).rejects.toThrow(OpenCodeAdapterError);
  });

  it("creates a codex provider when SESSION2SKILLS_ADAPTER=codex", async () => {
    process.env.SESSION2SKILLS_ADAPTER = "codex";
    process.env.CODEX_HOME = join(tmpdir(), "session2skills-missing-codex");

    const handle = await createSessionProvider({ directory: "/tmp" });
    expect(handle.provider).toBeDefined();
    expect(typeof handle.close).toBe("function");
    const sessions = await handle.provider.listRecentSessions({ directory: "/tmp" }, 5);
    expect(sessions).toEqual([]);
    await handle.close();
  });

  it("creates a claude provider when SESSION2SKILLS_ADAPTER=claude", async () => {
    process.env.SESSION2SKILLS_ADAPTER = "claude";
    process.env.CLAUDE_CONFIG_DIR = join(tmpdir(), "session2skills-missing-claude");

    const handle = await createSessionProvider({ directory: "/tmp" });
    expect(handle.provider).toBeDefined();
    expect(typeof handle.close).toBe("function");
    const sessions = await handle.provider.listRecentSessions({ directory: "/tmp" }, 5);
    expect(sessions).toEqual([]);
    await handle.close();
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
