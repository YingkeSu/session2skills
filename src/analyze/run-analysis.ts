import { createSessionProvider } from "../adapters/registry.js";
import { normalizeSession } from "../normalize/normalize-session.js";
import type {
  EvidenceItem,
  NormalizedSession,
  ProfileV2,
  WorkflowSignalKind,
} from "../normalize/models.js";
import type { RawSessionDiff } from "../normalize/raw-session.js";
import {
  buildMergedRuleClaims,
  buildProfileV2,
} from "../profile/build-profile.js";
import { filterSessions } from "./session-tree.js";
import type { TonePreset } from "../shared/cli.js";

export type AnalysisWarning = {
  type:
    | "diff-unavailable";
  sessionID?: string;
  dimension?: WorkflowSignalKind;
  message: string;
};

export type AnalysisOptions = {
  directory: string;
  workspace?: string;
  recent: number;
  messageLimit?: number;
  tone?: TonePreset;
};

export async function analyzeRecentSessions(options: AnalysisOptions): Promise<{
  normalizedSessions: Array<NormalizedSession>;
  profile: ProfileV2;
  warnings: Array<AnalysisWarning>;
  evidenceIndex?: Array<EvidenceItem>;
}> {
  const providerOpts = { directory: options.directory, workspace: options.workspace };
  const { provider, close } = await createSessionProvider(providerOpts);

  try {
    const listedSessions = await provider.listRecentSessions(providerOpts, options.recent);
    const filteredSessions = filterSessions(listedSessions);

    const normalizedSessions = [] as Array<NormalizedSession>;
    const warnings = [] as Array<AnalysisWarning>;

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
    const mergedClaims = buildMergedRuleClaims(normalizedSessions);
    const profile = buildProfileV2(mergedClaims, {
      confidenceNotes: buildAnalysisConfidenceNotes(skippedSessions, warnings),
    });

    return {
      normalizedSessions,
      profile,
      warnings,
    };
  } finally {
    await close();
  }
}

function buildAnalysisConfidenceNotes(
  skippedSessions: number,
  warnings: Array<AnalysisWarning>,
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
