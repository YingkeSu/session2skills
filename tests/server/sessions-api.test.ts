import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import type { SessionMeta } from "../../src/normalize/models.js";
import type { SessionProvider, SessionProviderOptions } from "../../src/adapters/provider.js";
import type { RawSession, RawSessionMessages, RawSessionDiff } from "../../src/normalize/raw-session.js";

vi.mock("../../src/adapters/registry.js", () => ({
  createSessionProvider: vi.fn(),
  createSessionProviderForType: vi.fn(),
  listAvailableAdapters: vi.fn().mockResolvedValue([]),
  makeSessionKey: vi.fn(
    (adapter: string, sessionId: string, source: string) =>
      `${adapter}:${sessionId}:${source}`,
  ),
}));

import { createServer } from "../../src/server/app.js";
import { listAvailableAdapters, createSessionProviderForType } from "../../src/adapters/registry.js";

function makeRawSession(overrides: Partial<RawSession> = {}): RawSession {
  return {
    id: "ses_test",
    title: "Test session",
    directory: "/tmp/project",
    updatedAt: 1000,
    ...overrides,
  };
}

function makeMessages(sessionID: string): RawSessionMessages {
  return [
    {
      info: { id: "msg_1", sessionID, role: "user", createdAt: 1 },
      parts: [{ id: "p1", sessionID, messageID: "msg_1", type: "text", text: "hello" }],
    },
  ];
}

function makeMockProvider(sessions: Array<RawSession>): SessionProvider {
  return {
    async listRecentSessions(_opts: SessionProviderOptions, recent: number) {
      return sessions.slice(0, recent);
    },
    async getSession(_opts: SessionProviderOptions, sessionID: string) {
      const found = sessions.find((s) => s.id === sessionID);
      if (!found) throw new Error(`Not found: ${sessionID}`);
      return found;
    },
    async getSessionMessages(_opts: SessionProviderOptions, sessionID: string) {
      return makeMessages(sessionID);
    },
    async getSessionDiff(): Promise<Array<RawSessionDiff>> {
      return [];
    },
  };
}

describe("GET /api/sessions", () => {
  let tempRoot: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-sessions-api-"));
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("returns session metadata array with required fields", async () => {
    const sessions = [
      makeRawSession({ id: "ses_1", title: "First session", updatedAt: 2000 }),
      makeRawSession({ id: "ses_2", title: "Second session", updatedAt: 1000 }),
    ];
    const provider = makeMockProvider(sessions);

    vi.mocked(listAvailableAdapters).mockResolvedValue([
      { adapterType: "sdk", sourceType: "sdk", sourcePath: null },
    ]);
    vi.mocked(createSessionProviderForType).mockResolvedValue({
      provider,
      close: vi.fn().mockResolvedValue(undefined),
    });

    const app = createServer(join(tempRoot, "runs"), {
      projectDirectory: tempRoot,
    });

    const res = await app.request("/api/sessions");
    expect(res.status).toBe(200);

    const body = (await res.json()) as SessionMeta[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    for (const item of body) {
      expect(item).toHaveProperty("providerId");
      expect(item).toHaveProperty("sessionId");
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("updatedAt");
      expect(item).toHaveProperty("sourceType");
    }

    expect(body[0]!.sessionId).toBe("ses_1");
    expect(body[0]!.title).toBe("First session");
    expect(body[0]!.providerId).toBe("sdk");
  });

  test("returns sessions filtered by adapter query param", async () => {
    const codexSessions = [makeRawSession({ id: "codex_1", title: "Codex session" })];
    const provider = makeMockProvider(codexSessions);

    vi.mocked(listAvailableAdapters).mockResolvedValue([
      { adapterType: "codex", sourceType: "sqlite", sourcePath: null },
    ]);
    vi.mocked(createSessionProviderForType).mockResolvedValue({
      provider,
      close: vi.fn().mockResolvedValue(undefined),
    });

    const app = createServer(join(tempRoot, "runs"), {
      projectDirectory: tempRoot,
    });

    const res = await app.request("/api/sessions?adapter=codex");
    expect(res.status).toBe(200);

    const body = (await res.json()) as SessionMeta[];
    expect(body).toHaveLength(1);
    expect(body[0]!.providerId).toBe("codex");
    expect(body[0]!.sessionId).toBe("codex_1");
  });

  test("returns sessions from all adapters when adapter=all", async () => {
    const sdkSessions = [makeRawSession({ id: "sdk_1", title: "SDK session" })];
    const codexSessions = [makeRawSession({ id: "codex_1", title: "Codex session" })];

    vi.mocked(listAvailableAdapters).mockResolvedValue([
      { adapterType: "sdk", sourceType: "sdk", sourcePath: null },
      { adapterType: "codex", sourceType: "sqlite", sourcePath: null },
    ]);

    vi.mocked(createSessionProviderForType).mockImplementation(
      async (type: string) => {
        const sessions = type === "sdk" ? sdkSessions : codexSessions;
        return {
          provider: makeMockProvider(sessions),
          close: vi.fn().mockResolvedValue(undefined),
        };
      },
    );

    const app = createServer(join(tempRoot, "runs"), {
      projectDirectory: tempRoot,
    });

    const res = await app.request("/api/sessions?adapter=all");
    expect(res.status).toBe(200);

    const body = (await res.json()) as SessionMeta[];
    expect(body).toHaveLength(2);
    const ids = body.map((s) => s.sessionId);
    expect(ids).toContain("sdk_1");
    expect(ids).toContain("codex_1");
  });

  test("returns empty array when adapter has no data", async () => {
    vi.mocked(listAvailableAdapters).mockResolvedValue([]);
    vi.mocked(createSessionProviderForType).mockResolvedValue({
      provider: makeMockProvider([]),
      close: vi.fn().mockResolvedValue(undefined),
    });

    const app = createServer(join(tempRoot, "runs"), {
      projectDirectory: tempRoot,
    });

    const res = await app.request("/api/sessions");
    expect(res.status).toBe(200);

    const body = (await res.json()) as SessionMeta[];
    expect(body).toEqual([]);
  });

  test("respects recent query param limit", async () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeRawSession({ id: `ses_${i}`, title: `Session ${i}`, updatedAt: 5000 - i * 100 }),
    );
    const provider = makeMockProvider(sessions);

    vi.mocked(listAvailableAdapters).mockResolvedValue([
      { adapterType: "sdk", sourceType: "sdk", sourcePath: null },
    ]);
    vi.mocked(createSessionProviderForType).mockResolvedValue({
      provider,
      close: vi.fn().mockResolvedValue(undefined),
    });

    const app = createServer(join(tempRoot, "runs"), {
      projectDirectory: tempRoot,
    });

    const res = await app.request("/api/sessions?recent=2");
    expect(res.status).toBe(200);

    const body = (await res.json()) as SessionMeta[];
    expect(body).toHaveLength(2);
  });

  test("filters sessions by search keyword in title", async () => {
    const sessions = [
      makeRawSession({ id: "ses_1", title: "Fix authentication bug" }),
      makeRawSession({ id: "ses_2", title: "Add new feature" }),
      makeRawSession({ id: "ses_3", title: "Auth refactor" }),
    ];
    const provider = makeMockProvider(sessions);

    vi.mocked(listAvailableAdapters).mockResolvedValue([
      { adapterType: "sdk", sourceType: "sdk", sourcePath: null },
    ]);
    vi.mocked(createSessionProviderForType).mockResolvedValue({
      provider,
      close: vi.fn().mockResolvedValue(undefined),
    });

    const app = createServer(join(tempRoot, "runs"), {
      projectDirectory: tempRoot,
    });

    const res = await app.request("/api/sessions?search=auth");
    expect(res.status).toBe(200);

    const body = (await res.json()) as SessionMeta[];
    expect(body).toHaveLength(2);
    const titles = body.map((s) => s.title);
    expect(titles).toContain("Fix authentication bug");
    expect(titles).toContain("Auth refactor");
  });
});
