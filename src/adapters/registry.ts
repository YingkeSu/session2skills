import type { SessionProvider, SessionProviderOptions } from "./provider.js";
import type { RawSessionDiff } from "../normalize/raw-session.js";
import { CliUsageError, OpenCodeAdapterError, toErrorMessage } from "../shared/errors.js";
import { openCodeDBExists } from "./sqlite/paths.js";
import { createSqliteSessionProvider } from "./sqlite/sessions.js";

export type AdapterType = "sdk" | "sqlite" | "codex" | "claude";

export type ProviderHandle = {
  provider: SessionProvider;
  close: () => Promise<void>;
};

export type AvailableAdapter = {
  adapterType: AdapterType;
  sourceType: "file" | "sqlite" | "sdk";
  sourcePath: string | null;
};

export function makeSessionKey(adapter: string, sessionId: string, source: string): string {
  return `${adapter}:${sessionId}:${source}`;
}

export async function listAvailableAdapters(
  _options?: SessionProviderOptions,
): Promise<Array<AvailableAdapter>> {
  const adapters: Array<AvailableAdapter> = [];

  try {
    const { codexDbExists } = await import("./codex/paths.js");
    if (codexDbExists()) {
      adapters.push({ adapterType: "codex", sourceType: "sqlite", sourcePath: null });
    }
  } catch {}

  try {
    const { claudeProjectsDirExists } = await import("./claude/paths.js");
    if (claudeProjectsDirExists()) {
      adapters.push({ adapterType: "claude", sourceType: "file", sourcePath: null });
    }
  } catch {}

  if (openCodeDBExists()) {
    adapters.push({ adapterType: "sqlite", sourceType: "sqlite", sourcePath: null });
  }

  adapters.push({ adapterType: "sdk", sourceType: "sdk", sourcePath: null });

  return adapters;
}

export async function createSessionProviderForType(
  adapterType: AdapterType,
  options?: SessionProviderOptions,
): Promise<ProviderHandle> {
  switch (adapterType) {
    case "sdk":
      return createSdkProvider(options ?? { directory: "" });
    case "sqlite":
      return createSqliteProvider({ eager: true });
    case "codex":
      return createCodexProvider();
    case "claude":
      return createClaudeProvider();
    default:
      throw new CliUsageError(
        `Unknown adapter type "${adapterType}". Expected "sdk", "sqlite", "codex", or "claude".`,
      );
  }
}

export async function createSessionProvider(
  options: SessionProviderOptions,
): Promise<ProviderHandle> {
  const adapter = process.env.SESSION2SKILLS_ADAPTER?.trim();

  if (adapter === "sdk") {
    return createSdkProvider(options);
  }

  if (adapter === "sqlite") {
    return createSqliteProvider({ eager: true });
  }

  if (adapter === "codex") {
    return createCodexProvider();
  }

  if (adapter === "claude") {
    return createClaudeProvider();
  }

  if (adapter) {
    throw new CliUsageError(
      `Unknown SESSION2SKILLS_ADAPTER value "${adapter}". Expected "sdk", "sqlite", "codex", or "claude".`,
    );
  }

  if (openCodeDBExists()) {
    try {
      return createSqliteProvider({ eager: true });
    } catch {
      return createSdkProvider(options);
    }
  }

  return createSdkProvider(options);
}

function createSqliteProvider(options: { eager?: boolean } = {}): ProviderHandle {
  const provider = createSqliteSessionProvider(undefined, options);
  return {
    provider,
    close: () => provider.close(),
  };
}

async function createCodexProvider(): Promise<ProviderHandle> {
  const { createCodexSessionProvider } = await import("./codex/sessions.js");
  const provider = createCodexSessionProvider();
  return {
    provider,
    close: () => provider.close(),
  };
}

async function createClaudeProvider(): Promise<ProviderHandle> {
  const { createClaudeSessionProvider } = await import("./claude/sessions.js");
  const provider = createClaudeSessionProvider();
  return {
    provider,
    close: async () => {
      await provider.close?.();
    },
  };
}

async function createSdkProvider(options: SessionProviderOptions): Promise<ProviderHandle> {
  const { createTypedOpenCodeClient } = await import("./opencode/client.js");
  const {
    listRecentSessionsWithClient,
    getSessionWithClient,
    getSessionMessagesWithClient,
    getSessionDiffWithClient,
  } = await import("./opencode/sessions.js");

  const runtime = await createTypedOpenCodeClient({
    directory: options.directory,
    workspace: options.workspace,
  });

  const provider: SessionProvider = {
    async listRecentSessions(opts, recent) {
      return listRecentSessionsWithClient(runtime.client, opts, recent);
    },
    async getSession(opts, sessionID) {
      return getSessionWithClient(runtime.client, opts, sessionID);
    },
    async getSessionMessages(opts, sessionID, limit) {
      return getSessionMessagesWithClient(runtime.client, opts, sessionID, limit);
    },
    async getSessionDiff(opts, sessionID, messageID) {
      try {
        return await getSessionDiffWithClient(runtime.client, opts, sessionID, messageID);
      } catch (error) {
        throw new OpenCodeAdapterError(
          `Failed to load diff: ${toErrorMessage(error)}`,
          { cause: error },
        );
      }
    },
  };

  return {
    provider,
    close: runtime.close,
  };
}
