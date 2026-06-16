import { createSessionProvider } from "../adapters/registry.js";
import { normalizeSession } from "../normalize/normalize-session.js";
import type { NormalizedSession } from "../normalize/models.js";
import type { RawSessionDiff } from "../normalize/raw-session.js";
import { filterSessions } from "./session-tree.js";

export type SessionLoadOptions = {
  directory: string;
  workspace?: string;
  recent: number;
  messageLimit?: number;
};

export type SessionWarning = {
  type: "diff-unavailable";
  sessionID?: string;
  message: string;
};

export async function loadSessions(options: SessionLoadOptions): Promise<{
  normalizedSessions: Array<NormalizedSession>;
  warnings: Array<SessionWarning>;
  skippedSessions: number;
}> {
  const providerOpts = { directory: options.directory, workspace: options.workspace };
  const { provider, close } = await createSessionProvider(providerOpts);

  try {
    const listedSessions = await provider.listRecentSessions(providerOpts, options.recent);
    const filteredSessions = filterSessions(listedSessions);

    const normalizedSessions = [] as Array<NormalizedSession>;
    const warnings = [] as Array<SessionWarning>;

    for (const listedSession of filteredSessions) {
      const session = await provider.getSession(providerOpts, listedSession.id);
      const messages = await provider.getSessionMessages(providerOpts, listedSession.id, options.messageLimit ?? 50);
      let diff: Array<RawSessionDiff> = [];
      try {
        diff = await provider.getSessionDiff(providerOpts, listedSession.id);
      } catch (error) {
        warnings.push({
          type: "diff-unavailable",
          sessionID: listedSession.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      normalizedSessions.push(
        normalizeSession({
          session,
          messages,
          diff,
        }),
      );
    }

    const skippedSessions = listedSessions.length - filteredSessions.length;

    return {
      normalizedSessions,
      warnings,
      skippedSessions,
    };
  } finally {
    await close();
  }
}

export function buildSessionLoadNotes(
  skippedSessions: number,
  warnings: Array<SessionWarning>,
): Array<string> {
  const notes: Array<string> = [];

  if (skippedSessions > 0) {
    notes.push(`session filtering: skipped ${skippedSessions} likely internal subagent/review session(s)`);
  }

  if (warnings.length > 0) {
    notes.push(`analysis warnings: ${warnings.length} session diff request(s) failed and were omitted from analysis`);
  }

  return notes;
}
