import type { SessionProvider, SessionProviderOptions } from "./provider.js";
import type { RawSessionDiff } from "../normalize/raw-session.js";
import { CliUsageError, OpenCodeAdapterError, toErrorMessage } from "../shared/errors.js";
import { openCodeDBExists } from "./sqlite/paths.js";
import { createSqliteSessionProvider } from "./sqlite/sessions.js";

type ProviderHandle = {
  provider: SessionProvider;
  close: () => Promise<void>;
};

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

  if (adapter) {
    throw new CliUsageError(
      `Unknown SESSION2SKILLS_ADAPTER value "${adapter}". Expected "sdk" or "sqlite".`,
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
