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

// Mock the registry BEFORE importing loadSessions — loadSessions calls
// createSessionProvider internally, so we intercept it at the module boundary.
vi.mock("../../src/adapters/registry.js", () => ({
  createSessionProvider: vi.fn(),
}));

// Import AFTER mock setup so the mocked module is used.
import { loadSessions } from "../../src/sessions/load-sessions.js";
import { createSessionProvider } from "../../src/adapters/registry.js";

const DIRECTORY = "/tmp/test-project";

function makeRawSession(overrides: Partial<RawSession> = {}): RawSession {
  return {
    id: "ses_regular",
    title: "Regular session",
    directory: DIRECTORY,
    updatedAt: 2,
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
          text: "Please analyze the repository before changing files.",
        },
        {
          id: "part_tool",
          sessionID,
          messageID: "msg_1",
          type: "tool",
          callID: "call_1",
          tool: "read",
          state: {
            status: "completed",
            input: { filePath: "src/app.ts" },
            output: "file contents",
            title: "Read file",
            time: { start: 1, end: 2 },
          },
        },
      ],
    },
  ];
}

const SAMPLE_DIFFS: Array<RawSessionDiff> = [
  { file: "src/app.ts", additions: 1, deletions: 0 },
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

function installMockProvider(provider: SessionProvider): void {
  vi.mocked(createSessionProvider).mockResolvedValue({
    provider,
    close: vi.fn().mockResolvedValue(undefined),
  });
}

describe("loadSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and normalizes sessions", async () => {
    installMockProvider(makeMockProvider());

    const result = await loadSessions({
      directory: DIRECTORY,
      recent: 10,
    });

    expect(result.normalizedSessions).toHaveLength(1);
    const session = result.normalizedSessions[0]!;
    expect(session.id).toBe("ses_regular");
    expect(session.messages.length).toBeGreaterThan(0);
    expect(session.toolInvocations.length).toBeGreaterThan(0);
  });

  it("includes subagent sessions (filterSessions is tree-order without options)", async () => {
    const regular = makeRawSession({ id: "ses_regular" });
    const subagent = makeRawSession({
      id: "ses_sub",
      parentID: "ses_regular",
    });
    installMockProvider(makeMockProvider({ sessions: [regular, subagent] }));

    const result = await loadSessions({
      directory: DIRECTORY,
      recent: 10,
    });

    expect(result.normalizedSessions).toHaveLength(2);
    const ids = result.normalizedSessions.map((s) => s.id);
    expect(ids).toContain("ses_regular");
    expect(ids).toContain("ses_sub");
    expect(result.skippedSessions).toBe(0);
  });

  it("reports zero skippedSessions when filterSessions includes all", async () => {
    const regular = makeRawSession({ id: "ses_regular" });
    const sub1 = makeRawSession({ id: "ses_sub1", parentID: "ses_regular" });
    const sub2 = makeRawSession({ id: "ses_sub2", parentID: "ses_regular" });
    installMockProvider(
      makeMockProvider({ sessions: [regular, sub1, sub2] }),
    );

    const result = await loadSessions({
      directory: DIRECTORY,
      recent: 10,
    });

    expect(result.normalizedSessions).toHaveLength(3);
    expect(result.skippedSessions).toBe(0);
  });

  it("reports a diff-unavailable warning when getSessionDiff throws", async () => {
    installMockProvider(makeMockProvider({ diffError: true }));

    const result = await loadSessions({
      directory: DIRECTORY,
      recent: 10,
    });

    expect(result.normalizedSessions).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.type).toBe("diff-unavailable");
    expect(result.warnings[0]!.sessionID).toBe("ses_regular");
    expect(result.warnings[0]!.message).toContain("diff unavailable");
  });

  it("returns empty normalizedSessions and zero skipped when no sessions exist", async () => {
    installMockProvider(makeMockProvider({ sessions: [] }));

    const result = await loadSessions({
      directory: DIRECTORY,
      recent: 10,
    });

    expect(result.normalizedSessions).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.skippedSessions).toBe(0);
  });

  it("calls close on the provider after loading", async () => {
    const closeFn = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createSessionProvider).mockResolvedValue({
      provider: makeMockProvider(),
      close: closeFn,
    });

    await loadSessions({ directory: DIRECTORY, recent: 10 });

    expect(closeFn).toHaveBeenCalledTimes(1);
  });
});
