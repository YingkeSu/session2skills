import { describe, expect, it } from "vitest";
import {
  computeJaccard,
  shingles,
  minHashSignature,
  estimateJaccardFromSignatures,
  lshBuckets,
} from "../../src/harness/minhash.js";

describe("minhash / lsh primitives", () => {
  describe("shingles", () => {
    it("produces k-character n-grams from text", () => {
      const result = shingles("abcde", 2);
      expect(result).toContain("ab");
      expect(result).toContain("bc");
      expect(result).toContain("cd");
      expect(result).toContain("de");
      expect(result.size).toBe(4);
    });

    it("returns empty set for text shorter than k characters", () => {
      expect(shingles("ab", 5).size).toBe(0);
    });

    it("lowercases and collapses whitespace before shingling", () => {
      expect([...shingles("  A   B  ", 3)]).toEqual(
        [...shingles("a b", 3)],
      );
    });
  });

  describe("computeJaccard", () => {
    it("returns 1 for identical sets", () => {
      expect(computeJaccard(new Set(["a", "b", "c"]), new Set(["a", "b", "c"]))).toBe(1);
    });

    it("returns 0 for disjoint sets", () => {
      expect(computeJaccard(new Set(["a", "b"]), new Set(["c", "d"]))).toBe(0);
    });

    it("returns ratio of intersection over union", () => {
      // intersection {b,c} = 2, union {a,b,c,d} = 4 -> 0.5
      expect(
        computeJaccard(new Set(["a", "b", "c"]), new Set(["b", "c", "d"])),
      ).toBe(0.5);
    });

    it("returns 0 for two empty sets", () => {
      expect(computeJaccard(new Set<string>(), new Set<string>())).toBe(0);
    });
  });

  describe("minHashSignature", () => {
    it("returns identical signatures for identical sets", () => {
      const a = new Set(["alpha", "beta", "gamma"]);
      const b = new Set(["alpha", "beta", "gamma"]);
      const sigA = minHashSignature(a, 64, 1);
      const sigB = minHashSignature(b, 64, 1);
      expect(sigA).toEqual(sigB);
    });

    it("produces signature length equal to permutations", () => {
      const sig = minHashSignature(new Set(["x", "y", "z"]), 32, 42);
      expect(sig).toHaveLength(32);
    });

    it("is deterministic for the same seed", () => {
      const set = new Set(["red", "green", "blue", "yellow"]);
      expect(minHashSignature(set, 16, 7)).toEqual(minHashSignature(set, 16, 7));
    });
  });

  describe("estimateJaccardFromSignatures", () => {
    it("returns 1 for identical signatures", () => {
      const sig = minHashSignature(new Set(["a", "b", "c"]), 64, 1);
      expect(estimateJaccardFromSignatures(sig, sig)).toBe(1);
    });

    it("approximates the true Jaccard for near-duplicates within tolerance", () => {
      const base = "the developer prefers to write tests before shipping features";
      const nearDup =
        "the developer prefers to write tests before shipping new features";
      const distinct =
        "configure the redis cache with a ttl of one hour for hot keys";

      const sigBase = minHashSignature(shingles(base, 2), 128, 3);
      const sigNear = minHashSignature(shingles(nearDup, 2), 128, 3);
      const sigDistinct = minHashSignature(shingles(distinct, 2), 128, 3);

      const trueNear = computeJaccard(shingles(base, 2), shingles(nearDup, 2));
      const estNear = estimateJaccardFromSignatures(sigBase, sigNear);

      // Estimate within +/- 0.15 of the true Jaccard.
      expect(Math.abs(estNear - trueNear)).toBeLessThan(0.15);
      // Near-duplicate should be highly similar.
      expect(estNear).toBeGreaterThan(0.7);

      const estDistinct = estimateJaccardFromSignatures(sigBase, sigDistinct);
      expect(estDistinct).toBeLessThan(0.3);
    });
  });

  describe("lshBuckets", () => {
    it("buckets identical signatures into the same band key", () => {
      const sig = minHashSignature(new Set(["a", "b", "c"]), 32, 1);
      const buckets = lshBuckets(sig, 8, 4); // 32 perms / 4 rows = 8 bands
      expect(buckets.length).toBe(8);
      // Same signature -> same bucket keys.
      expect(lshBuckets(sig, 8, 4)).toEqual(buckets);
    });
  });
});
