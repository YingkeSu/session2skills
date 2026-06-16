// Pure path-encoding utilities for Claude Code session storage.
//
// Claude encodes a project cwd into a directory name by replacing every
// non-alphanumeric character with "-". The mapping is LOSSY: "/" and " " and
// "." and "_" all collapse to "-", so it cannot be reversed reliably. The cwd
// source-of-truth is the `cwd` field inside each JSONL transcript line.

/**
 * Encode a project cwd into Claude's projects-directory name.
 *
 * "/Users/alice/my-project" -> "-Users-alice-my-project"
 * Root "/"               -> "-"
 */
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * Best-effort reverse-lookup predicate. Because the encoding is lossy, two
 * distinct cwds may collide on the same encoded form; this only confirms that
 * an encoded directory name corresponds to the given cwd (used when scanning
 * the projects directory).
 */
export function matchesEncodedCwd(encodedDir: string, cwd: string): boolean {
  return encodeCwd(cwd) === encodedDir;
}
