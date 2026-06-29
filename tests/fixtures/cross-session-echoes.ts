import type { EvidenceItem } from "../../src/normalize/models.js";

/**
 * Typed fixture: cross-session skill-echo evidence blocks.
 *
 * The same work habit surfaces in three different sessions. `sessionA`
 * is the original; `sessionB` and `sessionC` are near-duplicate echoes
 * (lightly reworded) that the MinHash + LSH fuzzy dedup should collapse
 * down to the single first occurrence. `sessionDistinct` is unrelated
 * work and must survive the filter.
 *
 * Used by tests/harness/evidence-dedup.test.ts.
 */

const BASE =
  "The developer prefers to write tests before shipping new features " +
  "and always runs the full suite before merging a pull request to main";

const ECHO_B =
  "The developer prefers to write tests before shipping features " +
  "and always runs the full test suite before merging a pull request";

const ECHO_C =
  "The developer prefers to author tests before shipping features " +
  "and always runs the full suite before merging a pull request to main";

const DISTINCT =
  "Configure the redis cache with a ttl of one hour for hot keys " +
  "and evict stale entries during the nightly maintenance window";

export type CrossSessionEchoFixture = {
  original: EvidenceItem;
  echoB: EvidenceItem;
  echoC: EvidenceItem;
  distinct: EvidenceItem;
  all: Array<EvidenceItem>;
};

export function makeCrossSessionEchoes(): CrossSessionEchoFixture {
  const original: EvidenceItem = {
    schemaVersion: "evidence-item/v1",
    evidenceID: "ev_echo_a",
    citation: {
      evidenceID: "ev_echo_a",
      sessionID: "ses_alpha",
      sourceType: "message",
    },
    summaryText: BASE,
  };

  const echoB: EvidenceItem = {
    schemaVersion: "evidence-item/v1",
    evidenceID: "ev_echo_b",
    citation: {
      evidenceID: "ev_echo_b",
      sessionID: "ses_beta",
      sourceType: "message",
    },
    summaryText: ECHO_B,
  };

  const echoC: EvidenceItem = {
    schemaVersion: "evidence-item/v1",
    evidenceID: "ev_echo_c",
    citation: {
      evidenceID: "ev_echo_c",
      sessionID: "ses_gamma",
      sourceType: "message",
    },
    summaryText: ECHO_C,
  };

  const distinct: EvidenceItem = {
    schemaVersion: "evidence-item/v1",
    evidenceID: "ev_distinct",
    citation: {
      evidenceID: "ev_distinct",
      sessionID: "ses_delta",
      sourceType: "message",
    },
    summaryText: DISTINCT,
  };

  return {
    original,
    echoB,
    echoC,
    distinct,
    all: [original, echoB, echoC, distinct],
  };
}
