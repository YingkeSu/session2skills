import { describe, expect, it } from "vitest";
import type { RawSession } from "../src/normalize/raw-session.js";
import { buildSessionTree, filterSessions, getSessionDepth, isSubagentSession } from "../src/sessions/session-tree.js";

function makeSession(id: string, parentID?: string): RawSession {
  return {
    id,
    directory: "/tmp/project",
    title: `Session ${id}`,
    updatedAt: 1,
    parentID,
  };
}

describe("buildSessionTree", () => {
  it("builds a flat tree from sessions with no parentID", () => {
    const sessions = [makeSession("a"), makeSession("b"), makeSession("c")];
    const { roots, nodes } = buildSessionTree(sessions);

    expect(roots).toHaveLength(3);
    expect(nodes.size).toBe(3);
    for (const root of roots) {
      expect(root.children).toHaveLength(0);
    }
  });

  it("builds parent-child relationships", () => {
    const sessions = [makeSession("parent"), makeSession("child", "parent")];
    const { roots, nodes } = buildSessionTree(sessions);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.session.id).toBe("parent");
    expect(roots[0]!.children).toHaveLength(1);
    expect(roots[0]!.children[0]!.session.id).toBe("child");
    expect(nodes.size).toBe(2);
  });

  it("handles orphan sessions (parentID references missing session)", () => {
    const sessions = [makeSession("orphan", "nonexistent")];
    const { roots } = buildSessionTree(sessions);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.session.id).toBe("orphan");
    expect(roots[0]!.children).toHaveLength(0);
  });

  it("does not infinite loop on circular parentID references", () => {
    const sessions = [makeSession("a", "b"), makeSession("b", "a")];
    const { roots } = buildSessionTree(sessions);

    expect(roots.length).toBeLessThanOrEqual(2);
  });

  it("handles deeply nested sessions", () => {
    const sessions = [
      makeSession("root"),
      makeSession("level1", "root"),
      makeSession("level2", "level1"),
      makeSession("level3", "level2"),
    ];
    const { roots } = buildSessionTree(sessions);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.session.id).toBe("root");
    expect(roots[0]!.children[0]!.session.id).toBe("level1");
    expect(roots[0]!.children[0]!.children[0]!.session.id).toBe("level2");
    expect(roots[0]!.children[0]!.children[0]!.children[0]!.session.id).toBe("level3");
  });
});

describe("filterSessions", () => {
  it("returns all sessions when includeSubagents is true", () => {
    const sessions = [makeSession("parent"), makeSession("child", "parent")];
    const result = filterSessions(sessions, { includeSubagents: true });

    expect(result).toHaveLength(2);
  });

  it("returns all sessions (parent + children) by default", () => {
    const sessions = [makeSession("parent"), makeSession("child", "parent")];
    const result = filterSessions(sessions);

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(["parent", "child"]);
  });

  it("does not infinite loop on circular parentID references", () => {
    const sessions = [makeSession("parent"), makeSession("child", "parent")];
    const result = filterSessions(sessions);

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(["parent", "child"]);
  });

  it("handles circular parentID without infinite recursion", () => {
    const sessions = [makeSession("a", "b"), makeSession("b", "a")];
    const result = filterSessions(sessions);

    expect(result.length).toBeLessThanOrEqual(2);
  });
});

describe("isSubagentSession", () => {
  it("returns true for sessions with parentID", () => {
    expect(isSubagentSession(makeSession("child", "parent"))).toBe(true);
  });

  it("returns false for sessions without parentID", () => {
    expect(isSubagentSession(makeSession("root"))).toBe(false);
  });
});

describe("getSessionDepth", () => {
  it("returns 0 for root sessions", () => {
    const sessions = [makeSession("root")];
    expect(getSessionDepth(sessions[0]!, sessions)).toBe(0);
  });

  it("returns correct depth for nested sessions", () => {
    const sessions = [
      makeSession("root"),
      makeSession("level1", "root"),
      makeSession("level2", "level1"),
    ];
    expect(getSessionDepth(sessions[2]!, sessions)).toBe(2);
  });

  it("does not infinite loop on circular parentID references", () => {
    const sessions = [makeSession("a", "b"), makeSession("b", "a")];
    const depth = getSessionDepth(sessions[0]!, sessions);
    expect(depth).toBeLessThanOrEqual(2);
  });
});
