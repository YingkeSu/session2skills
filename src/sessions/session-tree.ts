import type { RawSession } from "../normalize/raw-session.js";

export type SessionTreeNode = {
  session: RawSession;
  children: Array<SessionTreeNode>;
};

export function buildSessionTree(sessions: Array<RawSession>): {
  roots: Array<SessionTreeNode>;
  nodes: Map<string, SessionTreeNode>;
} {
  const nodes = new Map<string, SessionTreeNode>();

  for (const session of sessions) {
    nodes.set(session.id, { session, children: [] });
  }

  const roots: Array<SessionTreeNode> = [];

  for (const node of nodes.values()) {
    const parentID = node.session.parentID;
    if (parentID && nodes.has(parentID)) {
      nodes.get(parentID)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return { roots, nodes };
}

export type SessionFilterOptions = {
  includeSubagents?: boolean;
  maxDepth?: number;
};

export function filterSessions(
  sessions: Array<RawSession>,
  options?: SessionFilterOptions,
): Array<RawSession> {
  if (options?.includeSubagents) {
    return sessions;
  }

  const { roots } = buildSessionTree(sessions);
  const result: Array<RawSession> = [];
  const visited = new Set<string>();

  function collect(node: SessionTreeNode, depth: number): void {
    if (visited.has(node.session.id)) return;
    visited.add(node.session.id);

    const maxDepth = options?.maxDepth;
    if (maxDepth !== undefined && depth > maxDepth) return;

    result.push(node.session);

    for (const child of node.children) {
      collect(child, depth + 1);
    }
  }

  for (const root of roots) {
    collect(root, 0);
  }

  return result;
}

export function isSubagentSession(session: RawSession): boolean {
  return session.parentID != null;
}

export function getSessionDepth(session: RawSession, sessions: Array<RawSession>): number {
  const nodes = new Map<string, RawSession>();
  for (const s of sessions) {
    nodes.set(s.id, s);
  }

  let depth = 0;
  let current = session;
  const visited = new Set<string>([current.id]);

  while (current.parentID && nodes.has(current.parentID)) {
    if (visited.has(current.parentID)) break;
    visited.add(current.parentID);
    depth++;
    current = nodes.get(current.parentID)!;
  }

  return depth;
}
