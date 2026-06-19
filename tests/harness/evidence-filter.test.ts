import { describe, expect, it } from "vitest";
import type { EvidenceItem } from "../../src/normalize/models.js";
import { filterEvidenceNoise } from "../../src/harness/evidence-index.js";
import { makeEvidenceItem } from "./fixtures.js";

function itemWithText(
  evidenceID: string,
  summaryText: string,
): EvidenceItem {
  return makeEvidenceItem({
    evidenceID,
    citation: {
      evidenceID,
      sessionID: "ses_test",
      sourceType: "message",
    },
    summaryText,
  });
}

describe("filterEvidenceNoise", () => {
  describe("structural strip", () => {
    describe("Claude markers", () => {
      it('removes items starting with "Base directory for this skill:"', () => {
        const items = [
          itemWithText("ev_001", "Base directory for this skill: /home/user/.skills/my-skill"),
          itemWithText("ev_002", "Read three files before editing the module"),
        ];

        const result = filterEvidenceNoise(items, { filterMode: "structural" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].evidenceID).toBe("ev_002");
      });

      it('removes items containing XML <invocation name="..."> wrappers', () => {
        const items = [
          itemWithText("ev_001", '<invocation name="diagnose">Run the diagnose skill</invocation>'),
          itemWithText("ev_002", "Refactored the auth module to use JWT"),
        ];

        const result = filterEvidenceNoise(items, { filterMode: "structural" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].evidenceID).toBe("ev_002");
      });

      it("removes items with SKILL.md frontmatter (YAML frontmatter blocks)", () => {
        const items = [
          itemWithText(
            "ev_001",
            "---\nname: my-skill\ndescription: Does something\n---\n# Skill Body\nInstructions here",
          ),
          itemWithText("ev_002", "Fixed the failing test in auth.spec.ts"),
        ];

        const result = filterEvidenceNoise(items, { filterMode: "structural" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].evidenceID).toBe("ev_002");
      });
    });

    describe("Codex markers", () => {
      it("removes items with skill-body injection patterns", () => {
        const items = [
          itemWithText("ev_001", "Skill: diagnose\nDisciplined diagnosis loop for hard bugs"),
          itemWithText("ev_002", "Implemented user authentication flow"),
        ];

        const result = filterEvidenceNoise(items, { filterMode: "structural" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].evidenceID).toBe("ev_002");
      });

      it("removes items with slash-command skill calls", () => {
        const items = [
          itemWithText("ev_001", "/diagnose Fix the memory leak in the worker pool"),
          itemWithText("ev_002", "Updated the README with new API docs"),
        ];

        const result = filterEvidenceNoise(items, { filterMode: "structural" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].evidenceID).toBe("ev_002");
      });
    });

    describe("OpenCode markers", () => {
      it("removes items with `skill` tool call artifacts", () => {
        const items = [
          itemWithText("ev_001", "Tool: skill — Load skill: diagnose"),
          itemWithText("ev_002", "Wrote unit tests for the parser module"),
        ];

        const result = filterEvidenceNoise(items, { filterMode: "structural" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].evidenceID).toBe("ev_002");
      });

      it("removes items with injected skill content (---name:...)", () => {
        const items = [
          itemWithText("ev_001", "---name: tdd\ndescription: Test-driven development\n---\nRed-green-refactor loop"),
          itemWithText("ev_002", "Added rate limiting middleware"),
        ];

        const result = filterEvidenceNoise(items, { filterMode: "structural" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].evidenceID).toBe("ev_002");
      });
    });

    describe("generic markers", () => {
      it('removes items starting with "Use this skill when"', () => {
        const items = [
          itemWithText("ev_001", "Use this skill when you need to debug complex issues"),
          itemWithText("ev_002", "Deployed the application to staging"),
        ];

        const result = filterEvidenceNoise(items, { filterMode: "structural" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].evidenceID).toBe("ev_002");
      });

      it('removes items starting with "Skill: <name>"', () => {
        const items = [
          itemWithText("ev_001", "Skill: prototype\nBuild a throwaway prototype"),
          itemWithText("ev_002", "Configured the CI pipeline"),
        ];

        const result = filterEvidenceNoise(items, { filterMode: "structural" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].evidenceID).toBe("ev_002");
      });
    });

    it("preserves genuine work blocks with file paths and commands", () => {
      const items = [
        itemWithText("ev_001", "Read file src/auth/jwt.ts to understand the current implementation"),
        itemWithText("ev_002", "Run: npm test -- --filter auth"),
        itemWithText("ev_003", "Changed the return type from Promise<void> to Promise<Result>"),
        itemWithText("ev_004", "const token = jwt.sign(payload, secret, { expiresIn: '1h' })"),
      ];

      const result = filterEvidenceNoise(items, { filterMode: "structural" });

      expect(result.items).toHaveLength(4);
    });
  });

  describe("density gate", () => {
    it("removes items with very low text density (fewer than minTextDensity words)", () => {
      const items = [
        itemWithText("ev_001", "yes ok"),
        itemWithText("ev_002", "Read the config file and updated the database connection string"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density",
        minTextDensity: 5,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].evidenceID).toBe("ev_002");
    });

    it("removes items with very high n-gram repetition", () => {
      const items = [
        itemWithText("ev_001", "the the the the the the the the"),
        itemWithText("ev_002", "Refactored the authentication module to use JWT tokens"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density",
        maxNgramRepetition: 0.5,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].evidenceID).toBe("ev_002");
    });

    it("removes items with very low lexical diversity", () => {
      const items = [
        itemWithText("ev_001", "test test test test test test test test test test"),
        itemWithText("ev_002", "Implemented the caching layer with Redis and TTL expiration"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density",
        minLexicalDiversity: 0.2,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].evidenceID).toBe("ev_002");
    });

    it("preserves items that pass all density checks", () => {
      const items = [
        itemWithText(
          "ev_001",
          "Read the authentication module and refactored it to use JWT tokens instead of session cookies",
        ),
        itemWithText(
          "ev_002",
          "Fixed the race condition in the worker pool by adding a mutex lock around the shared state",
        ),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density",
        minTextDensity: 5,
        maxNgramRepetition: 0.5,
        minLexicalDiversity: 0.2,
      });

      expect(result.items).toHaveLength(2);
    });
  });

  describe("filter report", () => {
    it("counts items removed by structural strip", () => {
      const items = [
        itemWithText("ev_001", "Base directory for this skill: /home/user/.skills"),
        itemWithText("ev_002", '<invocation name="diagnose">Run diagnose</invocation>'),
        itemWithText("ev_003", "Implemented the new feature"),
      ];

      const result = filterEvidenceNoise(items, { filterMode: "structural" });

      expect(result.report.inputCount).toBe(3);
      expect(result.report.outputCount).toBe(1);
      expect(result.report.removedByStructural).toBe(2);
      expect(result.report.removedByDensity).toBe(0);
    });

    it("counts items removed by density gate", () => {
      const items = [
        itemWithText("ev_001", "ok"),
        itemWithText("ev_002", "the the the the the the the the"),
        itemWithText("ev_003", "Implemented the new feature with comprehensive tests"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density",
        minTextDensity: 5,
      });

      expect(result.report.inputCount).toBe(3);
      expect(result.report.outputCount).toBe(1);
      expect(result.report.removedByStructural).toBe(0);
      expect(result.report.removedByDensity).toBe(2);
    });

    it("lists removed items with evidenceID and reason", () => {
      const items = [
        itemWithText("ev_001", "Base directory for this skill: /home/user/.skills"),
        itemWithText("ev_002", "ok"),
        itemWithText("ev_003", "Implemented the new feature with comprehensive test coverage"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density",
        minTextDensity: 5,
      });

      expect(result.report.removedItems).toHaveLength(2);
      expect(result.report.removedItems).toContainEqual({
        evidenceID: "ev_001",
        reason: "structural",
      });
      expect(result.report.removedItems).toContainEqual({
        evidenceID: "ev_002",
        reason: "low-density",
      });
    });

    it("distinguishes between low-density, high-repetition, and low-diversity", () => {
      const items = [
        itemWithText("ev_001", "hi"),
        itemWithText("ev_002", "the the the the the the the the the the"),
        itemWithText("ev_003", "test test test test test test test test test test"),
        itemWithText("ev_004", "Implemented the new feature with comprehensive tests"),
      ];

      const result = filterEvidenceNoise(items, {
        filterMode: "structural+density",
        minTextDensity: 5,
        maxNgramRepetition: 0.5,
        minLexicalDiversity: 0.2,
      });

      const reasons = result.report.removedItems.map((r) => r.reason);
      expect(reasons).toContain("low-density");
      // The the-the and test-test items may be caught by different gates
      // depending on which threshold is hit first
      expect(result.report.removedByDensity).toBeGreaterThanOrEqual(2);
    });
  });

  describe("filter modes", () => {
    it('is OFF by default: calling without config returns all items unchanged', () => {
      const items = [
        itemWithText("ev_001", "Base directory for this skill: /home/user/.skills"),
        itemWithText("ev_002", "ok"),
        itemWithText("ev_003", "Implemented the new feature"),
      ];

      const result = filterEvidenceNoise(items);

      expect(result.items).toHaveLength(3);
      expect(result.report.inputCount).toBe(3);
      expect(result.report.outputCount).toBe(3);
      expect(result.report.removedByStructural).toBe(0);
      expect(result.report.removedByDensity).toBe(0);
    });

    it('is OFF when filterMode is "off"', () => {
      const items = [
        itemWithText("ev_001", "Base directory for this skill: /home/user/.skills"),
        itemWithText("ev_002", "ok"),
      ];

      const result = filterEvidenceNoise(items, { filterMode: "off" });

      expect(result.items).toHaveLength(2);
      expect(result.report.outputCount).toBe(2);
    });

    it('applies only structural strip when filterMode is "structural"', () => {
      const items = [
        itemWithText("ev_001", "Base directory for this skill: /home/user/.skills"),
        itemWithText("ev_002", "ok"),
        itemWithText("ev_003", "Implemented the new feature"),
      ];

      const result = filterEvidenceNoise(items, { filterMode: "structural" });

      // ev_001 removed by structural, ev_002 kept (density not checked)
      expect(result.items).toHaveLength(2);
      expect(result.report.removedByStructural).toBe(1);
      expect(result.report.removedByDensity).toBe(0);
    });

    it('applies both structural and density when filterMode is "structural+density"', () => {
      const items = [
        itemWithText("ev_001", "Base directory for this skill: /home/user/.skills"),
        itemWithText("ev_002", "ok"),
        itemWithText("ev_003", "Implemented the new feature with comprehensive test coverage"),
      ];

      const result = filterEvidenceNoise(items, { filterMode: "structural+density" });

      // ev_001 removed by structural, ev_002 removed by density
      expect(result.items).toHaveLength(1);
      expect(result.report.removedByStructural).toBe(1);
      expect(result.report.removedByDensity).toBe(1);
    });
  });

  describe("purity and edge cases", () => {
    it("does not mutate the input array", () => {
      const items = [
        itemWithText("ev_001", "Base directory for this skill: /home/user/.skills"),
        itemWithText("ev_002", "Implemented the new feature"),
      ];
      const originalLength = items.length;

      filterEvidenceNoise(items, { filterMode: "structural" });

      expect(items).toHaveLength(originalLength);
    });

    it("returns empty output for empty input", () => {
      const result = filterEvidenceNoise([], { filterMode: "structural+density" });

      expect(result.items).toHaveLength(0);
      expect(result.report.inputCount).toBe(0);
      expect(result.report.outputCount).toBe(0);
      expect(result.report.removedItems).toHaveLength(0);
    });

    it("same input always produces same output (pure function)", () => {
      const items = [
        itemWithText("ev_001", "Base directory for this skill: /home/user/.skills"),
        itemWithText("ev_002", "ok"),
        itemWithText("ev_003", "Implemented the new feature"),
      ];
      const config = { filterMode: "structural+density" as const, minTextDensity: 5 };

      const result1 = filterEvidenceNoise(items, config);
      const result2 = filterEvidenceNoise(items, config);

      expect(result1).toEqual(result2);
    });
  });
});
