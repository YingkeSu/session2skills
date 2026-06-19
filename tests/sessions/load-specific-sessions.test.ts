import { describe, expect, it, vi, beforeEach } from "vitest";

import type {
  SessionProvider,
  SessionProviderOptions,
} from "../../src/adapters/provider.js";
import type {
  RawSession,
  RawSessionDiff,
  RawSessionMessages,
} from "../../src/normalize/raw-session.js";

// Mock the registry BEFORE importing — loadSpecificSessions calls
// createSessionProviderForType internally, so we intercept at the module boundary.
vi.mock("../../src/adapters/registry.js", () => ({
  createSessionProvider: vi.fn(),
  createSessionProviderForType: vi.fn(),
  listAvailableAdapters: vi.fn(),
  makeSessionKey: vi.fn(
    (adapter: string, sessionId: string, source: string) =>
      `${adapter}:${sessionId}:${source}`,
  ),
}));

import {
  loadSpecificSessions,
  type SessionSelection,
} from "../../src/sessions/load-specific-sessions.js";
import { createSessionProviderForType } from "../../src/adapters/registry.js";

const DIRECTORY = "/tmp/test-project";

function makeRawSession(overrides: Partial<RawSession> = {}): RawSession {
  return {
    id: "ses_default",
    title: "Default session",
    directory: DIRECTORY,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeMessages(sessionID: string): RawSessionMessages {
  return [
    {
      info: {
        id: "msg_1",
        sessionID,
        role: "user",
        createdAt: 1,
      },
      parts: [
        {
          id: "part_1",
          sessionID,
          messageID: "msg_1",
          type: "text",
          text: "Analyze this codebase.",
        },
      ],
    },
  ];
}

const SAMPLE_DIFFS: Array<RawSessionDiff> = [
  { file: "src/app.ts", additions: 5, deletions: 2 },
];

type MockProviderOptions = {
  sessions?: Array<RawSession>;
  diffError?: boolean;
};

function makeMockProvider(opts: MockProviderOptions = {}): SessionProvider {
  const sessions = opts.sessions ?? [makeRawSession()];
  return {
    async listRecentSessions(
      _providerOpts: SessionProviderOptions,
      _recent: number,
    ): Promise<Array<RawSession>> {
      return sessions;
    },
    async getSession(
      _providerOpts: SessionProviderOptions,
      sessionID: string,
    ): Promise<RawSession> {
      const found = sessions.find((s) => s.id === sessionID);
      if (!found) {
        throw new Error(`Session not found: ${sessionID}`);
      }
      return found;
    },
    async getSessionMessages(
      _providerOpts: SessionProviderOptions,
      sessionID: string,
      _limit?: number,
    ): Promise<RawSessionMessages> {
      return makeMessages(sessionID);
    },
    async getSessionDiff(
      _providerOpts: SessionProviderOptions,
      _sessionID: string,
    ): Promise<Array<RawSessionDiff>> {
      if (opts.diffError) {
        throw new Error("diff unavailable");
      }
      return SAMPLE_DIFFS;
    },
  };
}

function installMockProviderForType(
  adapterType: string,
  provider: SessionProvider,
): void {
  vi.mocked(createSessionProviderForType).mockImplementation(
    async (type: string) => {
      if (type === adapterType) {
        return {
          provider,
          close: vi.fn().mockResolvedValue(undefined),
        };
      }
      throw new Error(`Unexpected adapter type: ${type}`);
    },
  );
}

describe("loadSpecificSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads a single session by explicit adapter+sessionId pair", async () => {
    const provider = makeMockProvider({
      sessions: [makeRawSession({ id: "ses_codex_1", title: "Codex session" })],
    });
    installMockProviderForType("codex", provider);

    const selections: Array<SessionSelection> = [
      { adapter: "codex", sessionId: "ses_codex_1" },
    ];

    const result = await loadSpecificSessions(selections, {
      directory: DIRECTORY,
    });

    expect(result.normalizedSessions).toHaveLength(1);
    expect(result.normalizedSessions[0]!.id).toBe("ses_codex_1");
    expect(result.normalizedSessions[0]!.title).toBe("Codex session");
  });

  it("can handle selections spanning multiple adapters", async () => {
    const codexSessions = [
      makeRawSession({ id: "codex_1", title: "Codex A" }),
      makeRawSession({ id: "codex_2", title: "Codex B" }),
    ];
    const claudeSessions = [
      makeRawSession({ id: "claude_1", title: "Claude X" }),
    ];

    const codexProvider = makeMockProvider({ sessions: codexSessions });
    const claudeProvider = makeMockProvider({ sessions: claudeSessions });

    vi.mocked(createSessionProviderForType).mockImplementation(
      async (type: string) => {
        if (type === "codex") {
          return { provider: codexProvider, close: vi.fn().mockResolvedValue(undefined) };
        }
        if (type === "claude") {
          return { provider: claudeProvider, close: vi.fn().mockResolvedValue(undefined) };
        }
        throw new Error(`Unexpected adapter type: ${type}`);
      },
    );

    const selections: Array<SessionSelection> = [
      { adapter: "codex", sessionId: "codex_1" },
      { adapter: "codex", sessionId: "codex_2" },
      { adapter: "claude", sessionId: "claude_1" },
    ];

    const result = await loadSpecificSessions(selections, {
      directory: DIRECTORY,
    });

    expect(result.normalizedSessions).toHaveLength(3);
    const ids = result.normalizedSessions.map((s) => s.id);
    expect(ids).toContain("codex_1");
    expect(ids).toContain("codex_2");
    expect(ids).toContain("claude_1");
  });

  it("returns normalized sessions with messages and tool invocations", async () => {
    const provider = makeMockProvider({
      sessions: [makeRawSession({ id: "ses_n1" })],
    });
    installMockProviderForType("sdk", provider);

    const selections: Array<SessionSelection> = [
      { adapter: "sdk", sessionId: "ses_n1" },
    ];

    const result = await loadSpecificSessions(selections, {
      directory: DIRECTORY,
    });

    expect(result.normalizedSessions).toHaveLength(1);
    const session = result.normalizedSessions[0]!;
    expect(session.messages.length).toBeGreaterThan(0);
    expect(session.diffSummary).toBeDefined();
  });

  it("reports diff-unavailable warning without crashing", async () => {
    const provider = makeMockProvider({
      sessions: [makeRawSession({ id: "ses_warn" })],
      diffError: true,
    });
    installMockProviderForType("codex", provider);

    const selections: Array<SessionSelection> = [
      { adapter: "codex", sessionId: "ses_warn" },
    ];

    const result = await loadSpecificSessions(selections, {
      directory: DIRECTORY,
    });

    expect(result.normalizedSessions).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.type).toBe("diff-unavailable");
    expect(result.warnings[0]!.sessionID).toBe("ses_warn");
  });

  it("skips selections where session is not found and continues", async () => {
    const provider = makeMockProvider({
      sessions: [makeRawSession({ id: "ses_exists" })],
    });
    installMockProviderForType("codex", provider);

    const selections: Array<SessionSelection> = [
      { adapter: "codex", sessionId: "ses_exists" },
      { adapter: "codex", sessionId: "ses_missing" },
    ];

    const result = await loadSpecificSessions(selections, {
      directory: DIRECTORY,
    });

    expect(result.normalizedSessions).toHaveLength(1);
    expect(result.normalizedSessions[0]!.id).toBe("ses_exists");
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty results for empty selections", async () => {
    const result = await loadSpecificSessions([], {
      directory: DIRECTORY,
    });

    expect(result.normalizedSessions).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("calls close on each provider handle", async () => {
    const closeFn = vi.fn().mockResolvedValue(undefined);
    const provider = makeMockProvider({
      sessions: [makeRawSession({ id: "ses_close" })],
    });

    vi.mocked(createSessionProviderForType).mockResolvedValue({
      provider,
      close: closeFn,
    });

    const selections: Array<SessionSelection> = [
      { adapter: "codex", sessionId: "ses_close" },
    ];

    await loadSpecificSessions(selections, { directory: DIRECTORY });

    expect(closeFn).toHaveBeenCalledTimes(1);
  });
});
