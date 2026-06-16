import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCodexSessionProvider } from "../../../src/adapters/codex/sessions.js";
import { OpenCodeAdapterError } from "../../../src/shared/errors.js";
import type { CodexThreadRow } from "../../../src/adapters/codex/types.js";
import {
  makeAssistantMessageLine,
  makeSessionMetaLine,
  makeThreadRow,
  makeUserMessageLine,
} from "../../fixtures/codex-fixtures.js";

const DIRECTORY = "/tmp/codex-project";
const OTHER_DIRECTORY = "/tmp/codex-other";

type Harness = {
  dbPath: string;
  rolloutPathFor: (id: string) => string;
  cleanup: () => void;
};

function createHarness(rows: Array<CodexThreadRow>): Harness {
  const tmp = mkdtempSync(join(tmpdir(), "codex-sessions-"));
  const dbPath = join(tmp, "state_5.sqlite");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      rollout_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      model_provider TEXT NOT NULL,
      cwd TEXT NOT NULL,
      title TEXT NOT NULL,
      sandbox_policy TEXT NOT NULL,
      approval_mode TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      has_user_event INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at INTEGER,
      git_sha TEXT,
      git_branch TEXT,
      git_origin_url TEXT
    );
  `);

  const insert = db.prepare(
    `INSERT INTO threads (
      id, rollout_path, created_at, updated_at, source, model_provider,
      cwd, title, sandbox_policy, approval_mode, tokens_used,
      has_user_event, archived, archived_at, git_sha, git_branch, git_origin_url
    ) VALUES (
      @id, @rollout_path, @created_at, @updated_at, @source, @model_provider,
      @cwd, @title, @sandbox_policy, @approval_mode, @tokens_used,
      @has_user_event, @archived, @archived_at, @git_sha, @git_branch, @git_origin_url
    )`,
  );

  for (const row of rows) {
    const rolloutPath = join(tmp, `rollout-${row.id}.jsonl`);
    insert.run({ ...row, rollout_path: rolloutPath });
    writeFileSync(
      rolloutPath,
      [
        makeSessionMetaLine(row.cwd),
        makeUserMessageLine(`user text for ${row.id}`),
        makeAssistantMessageLine(`assistant text for ${row.id}`),
      ].join("\n"),
      "utf8",
    );
  }

  db.close();

  return {
    dbPath,
    rolloutPathFor: (id) => join(tmp, `rollout-${id}.jsonl`),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

const NOW_SECONDS = 1_746_093_600;

function row(overrides: Partial<CodexThreadRow>): CodexThreadRow {
  return makeThreadRow({
    cwd: DIRECTORY,
    created_at: NOW_SECONDS,
    updated_at: NOW_SECONDS,
    ...overrides,
  });
}

let harness: Harness | undefined;

beforeEach(() => {
  harness = undefined;
});

afterEach(() => {
  harness?.cleanup();
  harness = undefined;
});

const OPTIONS = { directory: DIRECTORY };

describe("createCodexSessionProvider", () => {
  it("listRecentSessions returns threads ordered by updated_at desc and mapped to RawSession", async () => {
    harness = createHarness([
      row({ id: "old", updated_at: NOW_SECONDS, created_at: NOW_SECONDS }),
      row({ id: "new", updated_at: NOW_SECONDS + 600, created_at: NOW_SECONDS + 600 }),
      row({ id: "mid", updated_at: NOW_SECONDS + 300, created_at: NOW_SECONDS + 300 }),
    ]);

    const provider = createCodexSessionProvider(harness.dbPath);
    const sessions = await provider.listRecentSessions(OPTIONS, 10);

    expect(sessions.map((s) => s.id)).toEqual(["new", "mid", "old"]);

    const newest = sessions[0];
    expect(newest?.id).toBe("new");
    expect(newest?.directory).toBe(DIRECTORY);
    expect(newest?.updatedAt).toBe((NOW_SECONDS + 600) * 1000);
    expect(newest?.createdAt).toBe((NOW_SECONDS + 600) * 1000);
    expect(newest?.model).toEqual({ id: "codex", providerID: "openai" });
    expect(newest?.tokens).toBeUndefined();

    await provider.close();
  });

  it("limits listRecentSessions to the recent count", async () => {
    harness = createHarness([
      row({ id: "a", updated_at: 1 }),
      row({ id: "b", updated_at: 2 }),
      row({ id: "c", updated_at: 3 }),
    ]);

    const provider = createCodexSessionProvider(harness.dbPath);
    const sessions = await provider.listRecentSessions(OPTIONS, 2);
    expect(sessions.map((s) => s.id)).toEqual(["c", "b"]);
    await provider.close();
  });

  it("filters listRecentSessions by options.directory and excludes archived threads", async () => {
    harness = createHarness([
      row({ id: "match1", cwd: DIRECTORY, updated_at: 10 }),
      row({ id: "match2", cwd: DIRECTORY, updated_at: 5 }),
      row({ id: "archived", cwd: DIRECTORY, updated_at: 99, archived: 1 }),
      row({ id: "other-cwd", cwd: OTHER_DIRECTORY, updated_at: 999 }),
    ]);

    const provider = createCodexSessionProvider(harness.dbPath);
    const sessions = await provider.listRecentSessions(OPTIONS, 50);
    expect(sessions.map((s) => s.id).sort()).toEqual(["match1", "match2"]);
    await provider.close();
  });

  it("exposes tokens when tokens_used > 0", async () => {
    harness = createHarness([row({ id: "tok", tokens_used: 1234 })]);
    const provider = createCodexSessionProvider(harness.dbPath);
    const sessions = await provider.listRecentSessions(OPTIONS, 10);
    expect(sessions[0]?.tokens).toEqual({
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    });
    await provider.close();
  });

  it("getSession returns the matching row", async () => {
    harness = createHarness([row({ id: "solo", title: "Solo thread" })]);
    const provider = createCodexSessionProvider(harness.dbPath);
    const session = await provider.getSession(OPTIONS, "solo");
    expect(session.id).toBe("solo");
    expect(session.title).toBe("Solo thread");
    await provider.close();
  });

  it("getSession throws OpenCodeAdapterError when not found", async () => {
    harness = createHarness([row({ id: "present" })]);
    const provider = createCodexSessionProvider(harness.dbPath);
    await expect(provider.getSession(OPTIONS, "missing")).rejects.toBeInstanceOf(
      OpenCodeAdapterError,
    );
    await provider.close();
  });

  it("getSessionMessages parses the rollout file into RawSessionMessages", async () => {
    harness = createHarness([row({ id: "msgs" })]);
    const provider = createCodexSessionProvider(harness.dbPath);
    const messages = await provider.getSessionMessages(OPTIONS, "msgs");
    expect(messages.map((m) => m.info.role)).toEqual(["user", "assistant"]);
    expect(messages[0]?.parts[0]?.text).toBe("user text for msgs");
    expect(messages[1]?.parts[0]?.text).toBe("assistant text for msgs");
    expect(messages[0]?.info.sessionID).toBe("msgs");
    await provider.close();
  });

  it("getSessionMessages honours the limit argument by returning the last N messages", async () => {
    harness = createHarness([row({ id: "lim" })]);
    const provider = createCodexSessionProvider(harness.dbPath);
    const messages = await provider.getSessionMessages(OPTIONS, "lim", 1);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.info.role).toBe("assistant");
    await provider.close();
  });

  it("getSessionMessages throws OpenCodeAdapterError when the session is missing", async () => {
    harness = createHarness([row({ id: "present" })]);
    const provider = createCodexSessionProvider(harness.dbPath);
    await expect(
      provider.getSessionMessages(OPTIONS, "ghost"),
    ).rejects.toBeInstanceOf(OpenCodeAdapterError);
    await provider.close();
  });

  it("getSessionDiff always returns an empty array", async () => {
    harness = createHarness([row({ id: "diff" })]);
    const provider = createCodexSessionProvider(harness.dbPath);
    const diffs = await provider.getSessionDiff(OPTIONS, "diff");
    expect(diffs).toEqual([]);
    await provider.close();
  });

  it("listRecentSessions returns [] when the Codex SQLite does not exist", async () => {
    const provider = createCodexSessionProvider(
      join(tmpdir(), "definitely-missing-state_5.sqlite"),
    );
    const sessions = await provider.listRecentSessions(OPTIONS, 10);
    expect(sessions).toEqual([]);
    await provider.close();
  });

  it("getSession throws OpenCodeAdapterError when the Codex SQLite does not exist", async () => {
    const provider = createCodexSessionProvider(
      join(tmpdir(), "definitely-missing-state_5.sqlite"),
    );
    await expect(provider.getSession(OPTIONS, "anything")).rejects.toBeInstanceOf(
      OpenCodeAdapterError,
    );
    await provider.close();
  });
});
