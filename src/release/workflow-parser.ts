/**
 * Minimal, dependency-free extractors for the bits of GitHub Actions workflow
 * YAML that the release contract depends on.
 *
 * We intentionally avoid a full YAML parser to keep `session2skills` lean
 * (AGENTS.md: "lean deps"). The release workflow is a small, hand-curated
 * file; these helpers assert only on the contract that matters.
 */

export type WorkflowPermissionValue = "read" | "write" | "none";

export type WorkflowPermissions = Record<string, WorkflowPermissionValue>;

/**
 * Parse the top-level `permissions:` block of a workflow YAML string.
 *
 * Supports the explicit map form:
 *
 * ```yaml
 * permissions:
 *   contents: write
 *   id-token: write
 *   pull-requests: write
 * ```
 *
 * Returns an empty object when no top-level permissions block is present.
 */
export function parseWorkflowPermissions(yaml: string): WorkflowPermissions {
  const result: WorkflowPermissions = {};

  const lines = yaml.split(/\r?\n/);

  // Find the top-level `permissions:` key (no leading indentation).
  const startIndex = lines.findIndex((line) => /^permissions:\s*$/.test(line));
  if (startIndex === -1) {
    return result;
  }

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];

    // Stop at the next top-level key (a non-empty, non-indented line that is
    // not a comment).
    if (line.length > 0 && !/^\s/.test(line) && !line.startsWith("#")) {
      break;
    }

    // Match `<indent>key: value` where value is one of read|write|none.
    const match = line.match(/^\s+([a-z][a-z0-9-]*):\s*(read|write|none)\s*$/i);
    if (match) {
      const [, rawKey, rawValue] = match;
      const key = rawKey.toLowerCase();
      const value = rawValue.toLowerCase() as WorkflowPermissionValue;
      result[key] = value;
    }
  }

  return result;
}
