import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CliUsageError } from "../shared/errors.js";

/**
 * Template registry for skill file output formats.
 *
 * Each template defines a structural reference that the Writer stage uses
 * to match section style, heading levels, and frontmatter format.
 */

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

export type TemplateName = "claude-skill" | "opencode-skill" | "cursor-mdc" | "copilot-instructions";

export const AVAILABLE_TEMPLATES: ReadonlyArray<TemplateName> = [
  "claude-skill",
  "opencode-skill",
  "cursor-mdc",
  "copilot-instructions",
];

/** Maps each template to its canonical file path relative to the templates directory. */
const TEMPLATE_FILE_NAMES: Record<TemplateName, string> = {
  "claude-skill": "SKILL.md",
  "opencode-skill": "SKILL.md",
  "cursor-mdc": "rule.mdc",
  "copilot-instructions": "instructions.md",
};

// ---------------------------------------------------------------------------
// Resolving the templates root directory
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path to the `templates/` directory at the repo root.
 * Works both in development (src/) and after build (dist/).
 */
function resolveTemplatesRoot(): string {
  // In ESM, __dirname is not available; reconstruct from import.meta.url.
  // From src/generate/templates.ts → walk up to repo root.
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, "../../templates");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse and validate a template name string.
 * Throws CliUsageError for invalid values.
 */
export function parseTemplate(value: string): TemplateName {
  if (!AVAILABLE_TEMPLATES.includes(value as TemplateName)) {
    throw new CliUsageError(
      `Invalid template: ${value}. Available: ${AVAILABLE_TEMPLATES.join(", ")}`,
    );
  }
  return value as TemplateName;
}

/**
 * Load the template markdown content for the given template name.
 * Returns the file contents as a string.
 */
export async function loadTemplateMarkdown(name: TemplateName): Promise<string> {
  const templatesRoot = resolveTemplatesRoot();
  const fileName = TEMPLATE_FILE_NAMES[name];
  const filePath = join(templatesRoot, name, fileName);

  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      throw new CliUsageError(`Template file not found: ${filePath}`);
    }
    throw error;
  }
}
