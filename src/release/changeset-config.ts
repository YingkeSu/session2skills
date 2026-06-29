/**
 * Type describing the shape of `.changeset/config.json`.
 *
 * Kept in `src/` so both the runtime and the release-workflow test share a
 * single source of truth for the changeset contract.
 */
export interface ChangesetConfig {
  /** Visibility of published packages: "public" | "restricted". */
  access: "public" | "restricted";
  /** Branch changesets are merged into. */
  baseBranch: string;
  /** Changelog generator module path. */
  changelog: string;
  /** Bump range used when updating internal dependencies. */
  updateInternalDependencies: "patch" | "minor" | "major";
  /** Whether to git-tag releases. */
  git?: boolean;
  /** Snapshot configuration. */
  snapshot?: unknown;
  /** Packages ignored by changesets (patterns). */
  ignore?: string[];
  /** Linked packages. */
  linked?: string[] | null;
  /** Commit message template. */
  commit?: string | null;
  /** Whether the fixed mode is used. */
  fixed?: string[] | null;
}
