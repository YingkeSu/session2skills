import { describe, expect, it } from "vitest";
import type { EvidenceItem } from "../../src/normalize/models.js";
import { filterEvidenceNoise } from "../../src/harness/evidence-index.js";
import { makeEvidenceItem } from "./fixtures.js";
import { makeCrossSessionEchoes } from "../fixtures/cross-session-echoes.js";

function itemWithText(
  evidenceID: string,
  summaryText: string,
  sessionID: string = "ses_test",
): EvidenceItem {
  return makeEvidenceItem({
    evidenceID,
    citation: {
      evidenceID,
      sessionID,
      sourceType: "message",
    },
    summaryText,
  });
}

const ORIGINAL_BLOCK =
  "The developer prefers to write tests before shipping new features " +
  "and always runs the full suite before merging a pull request";

// A near-duplicate: same structure, a handful of word swaps. High Jaccard
// on 5-gram shingles (the cross-session skill echo this slice targets).
const NEAR_DUPLICATE_BLOCK =
  "The developer prefers to write tests before shipping features " +
  "and always runs the full test suite before merging a pull request";

// A genuinely distinct block: should be retained.
const DISTINCT_BLOCK =
  "Configure the redis cache with a ttl of one hour for hot keys " +
  "and evict stale entries during the nightly maintenance window";

describe("filterEvidenceNoise — fuzzy dedup (MinHash + LSH)", () => {
  describe("identical items", () => {
    it("collapses byte-identical blocks to a single item", () => {
      const items = [
        itemWithText("ev_a", ORIGINAL_BLOCK, "ses_1"),
        itemWithText("ev_b", ORIGINAL_BLOCK, "ses_2"),
        itemWithText("ev_c", ORIGINAL_BLOCK, "ses_3"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density+fuzzy",
        minHashThreshold: 0.75,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].evidenceID).toBe("ev_a");
      expect(result.report.removedByFuzzy).toBe(2);
    });
  });

  describe("near-duplicate items", () => {
    it("removes a near-duplicate that exceeds the Jaccard threshold (keep first)", () => {
      const items = [
        itemWithText("ev_first", ORIGINAL_BLOCK, "ses_1"),
        itemWithText("ev_echo", NEAR_DUPLICATE_BLOCK, "ses_2"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density+fuzzy",
        minHashThreshold: 0.75,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].evidenceID).toBe("ev_first");
      expect(result.report.removedByFuzzy).toBe(1);
      expect(result.report.removedItems).toContainEqual({
        evidenceID: "ev_echo",
        reason: "fuzzy-duplicate",
      });
    });

    it("does not remove near-duplicates when threshold is raised above their similarity", () => {
      const items = [
        itemWithText("ev_first", ORIGINAL_BLOCK, "ses_1"),
        itemWithText("ev_echo", NEAR_DUPLICATE_BLOCK, "ses_2"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density+fuzzy",
        minHashThreshold: 0.99,
      });

      // Threshold above the pair's Jaccard -> both kept.
      expect(result.items).toHaveLength(2);
      expect(result.report.removedByFuzzy).toBe(0);
    });

    it("configurable threshold lowers the bar (threshold 0.5 catches more)", () => {
      const items = [
        itemWithText("ev_first", ORIGINAL_BLOCK, "ses_1"),
        itemWithText("ev_echo", NEAR_DUPLICATE_BLOCK, "ses_2"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density+fuzzy",
        minHashThreshold: 0.5,
      });

      expect(result.items).toHaveLength(1);
      expect(result.report.removedByFuzzy).toBe(1);
    });
  });

  describe("distinct items", () => {
    it("keeps distinct blocks untouched", () => {
      const items = [
        itemWithText("ev_a", ORIGINAL_BLOCK, "ses_1"),
        itemWithText("ev_b", DISTINCT_BLOCK, "ses_2"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density+fuzzy",
        minHashThreshold: 0.75,
      });

      expect(result.items).toHaveLength(2);
      expect(result.report.removedByFuzzy).toBe(0);
    });
  });

  describe("filter modes", () => {
    it('"all" mode applies structural + density + fuzzy', () => {
      const items = [
        itemWithText("ev_noise", "Skill: prototype\nBuild a throwaway prototype"),
        itemWithText("ev_low", "ok"),
        itemWithText("ev_first", ORIGINAL_BLOCK, "ses_1"),
        itemWithText("ev_echo", NEAR_DUPLICATE_BLOCK, "ses_2"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "all",
        minHashThreshold: 0.75,
        minTextDensity: 5,
      });

      // structural removes ev_noise, density removes ev_low, fuzzy removes ev_echo.
      expect(result.items).toHaveLength(1);
      expect(result.items[0].evidenceID).toBe("ev_first");
      expect(result.report.removedByStructural).toBe(1);
      expect(result.report.removedByDensity).toBe(1);
      expect(result.report.removedByFuzzy).toBe(1);
    });

    it('"structural+density" does NOT apply fuzzy (back-compat)', () => {
      const items = [
        itemWithText("ev_first", ORIGINAL_BLOCK, "ses_1"),
        itemWithText("ev_echo", NEAR_DUPLICATE_BLOCK, "ses_2"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density",
        minHashThreshold: 0.75,
      });

      expect(result.items).toHaveLength(2);
      expect(result.report.removedByFuzzy).toBe(0);
    });

    it('keeps a transitive cluster of near-duplicates down to one (keep first)', () => {
      // Three blocks, each near-duplicate of the next at the default threshold.
      const items = [
        itemWithText("ev_a", ORIGINAL_BLOCK, "ses_1"),
        itemWithText("ev_b", NEAR_DUPLICATE_BLOCK, "ses_2"),
        itemWithText(
          "ev_c",
          ORIGINAL_BLOCK.replace("write tests", "author tests"),
          "ses_3",
        ),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "all",
        minHashThreshold: 0.7,
        minTextDensity: 5,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].evidenceID).toBe("ev_a");
      expect(result.report.removedByFuzzy).toBe(2);
    });
  });

  describe("report purity", () => {
    it("does not mutate the input array", () => {
      const items = [
        itemWithText("ev_a", ORIGINAL_BLOCK, "ses_1"),
        itemWithText("ev_b", NEAR_DUPLICATE_BLOCK, "ses_2"),
      ];
      const originalLength = items.length;

      filterEvidenceNoise(items, {
        filterMode: "structural+density+fuzzy",
        minHashThreshold: 0.75,
      });

      expect(items).toHaveLength(originalLength);
    });

    it("is pure: same input + config -> same output", () => {
      const items = [
        itemWithText("ev_a", ORIGINAL_BLOCK, "ses_1"),
        itemWithText("ev_b", NEAR_DUPLICATE_BLOCK, "ses_2"),
      ];
      const config = {
        filterMode: "all" as const,
        minHashThreshold: 0.75,
        minTextDensity: 5,
      };

      const r1 = filterEvidenceNoise(items, config);
      const r2 = filterEvidenceNoise(items, config);

      expect(r1).toEqual(r2);
    });
  });

  describe("typed fixture: cross-session skill echoes", () => {
    it("collapses three cross-session echoes to one, keeps the distinct block", () => {
      const fixture = makeCrossSessionEchoes();

      const result = filterEvidenceNoise(fixture.all, {
        filterMode: "all",
        minHashThreshold: 0.7,
        minTextDensity: 5,
      });

      // original + distinct survive; echoB + echoC removed as fuzzy-duplicates.
      expect(result.items).toHaveLength(2);
      const survivingIds = result.items.map((i) => i.evidenceID);
      expect(survivingIds).toContain("ev_echo_a");
      expect(survivingIds).toContain("ev_distinct");
      expect(result.report.removedByFuzzy).toBe(2);
    });
  });
});
