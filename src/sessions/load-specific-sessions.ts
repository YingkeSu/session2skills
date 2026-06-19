import {
  createSessionProviderForType,
  type AdapterType,
  type ProviderHandle,
} from "../adapters/registry.js";
import { normalizeSession } from "../normalize/normalize-session.js";
import type { NormalizedSession } from "../normalize/models.js";
import type { RawSessionDiff } from "../normalize/raw-session.js";
import type { SessionWarning } from "./load-sessions.js";

export type SessionSelection = {
  adapter: AdapterType;
  sessionId: string;
};

export type SpecificSessionLoadOptions = {
  directory: string;
  workspace?: string;
  messageLimit?: number;
};

export async function loadSpecificSessions(
  selections: Array<SessionSelection>,
  options: SpecificSessionLoadOptions,
): Promise<{
  normalizedSessions: Array<NormalizedSession>;
  warnings: Array<SessionWarning>;
}> {
  if (selections.length === 0) {
    return { normalizedSessions: [], warnings: [] };
  }

  const groupedByAdapter = groupSelectionsByAdapter(selections);
  const normalizedSessions: Array<NormalizedSession> = [];
  const warnings: Array<SessionWarning> = [];

  for (const [adapterType, sessionIds] of groupedByAdapter) {
    let handle: ProviderHandle | undefined;
    try {
      handle = await createSessionProviderForType(adapterType, {
        directory: options.directory,
        workspace: options.workspace,
      });

      for (const sessionId of sessionIds) {
        try {
          const session = await handle.provider.getSession(
            { directory: options.directory, workspace: options.workspace },
            sessionId,
          );
          const messages = await handle.provider.getSessionMessages(
            { directory: options.directory, workspace: options.workspace },
            sessionId,
            options.messageLimit ?? 50,
          );

          let diff: Array<RawSessionDiff> = [];
          try {
            diff = await handle.provider.getSessionDiff(
              { directory: options.directory, workspace: options.workspace },
              sessionId,
            );
          } catch (error) {
            warnings.push({
              type: "diff-unavailable",
              sessionID: sessionId,
              message: error instanceof Error ? error.message : String(error),
            });
          }

          normalizedSessions.push(normalizeSession({ session, messages, diff }));
        } catch {
          warnings.push({
            type: "diff-unavailable",
            sessionID: sessionId,
            message: `Session not found: ${sessionId}`,
          });
        }
      }
    } catch {
      for (const sessionId of sessionIds) {
        warnings.push({
          type: "diff-unavailable",
          sessionID: sessionId,
          message: `Failed to create provider for adapter: ${adapterType}`,
        });
      }
    } finally {
      await handle?.close();
    }
  }

  return { normalizedSessions, warnings };
}

function groupSelectionsByAdapter(
  selections: Array<SessionSelection>,
): Map<AdapterType, Array<string>> {
  const grouped = new Map<AdapterType, Array<string>>();
  for (const sel of selections) {
    const list = grouped.get(sel.adapter);
    if (list) {
      list.push(sel.sessionId);
    } else {
      grouped.set(sel.adapter, [sel.sessionId]);
    }
  }
  return grouped;
}
