import { CliUsageError } from "../shared/errors.js";
import { containsSecretMaterial } from "../shared/redaction.js";

export type SkillLintIssueCode =
  | "missing-frontmatter"
  | "missing-frontmatter-name"
  | "missing-frontmatter-description"
  | "debug-phrase"
  | "secret-material"
  | "env-payload";

export type SkillLintIssue = {
  code: SkillLintIssueCode;
  message: string;
};

const DEBUG_PHRASE_PATTERN = /\bdirective\(s\)/i;
const ENV_PAYLOAD_PATTERN =
  /(?:^|[\r\n])(?:[^\r\n]*(?:generated-skills|\.session2skills)[^\r\n]*)?(?:\.env\b[^\r\n]*[\r\n])?(?:[A-Za-z_][A-Za-z0-9_]*(?:API_KEY|ACCESS_KEY|AUTH_TOKEN|CLIENT_SECRET|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY)[A-Za-z0-9_]*\s*=)/i;

export function lintSkillMarkdown(markdown: string): Array<SkillLintIssue> {
  const issues: Array<SkillLintIssue> = [];
  const frontmatter = parseFrontmatter(markdown);

  if (!frontmatter) {
    issues.push({
      code: "missing-frontmatter",
      message: "SKILL.md must start with YAML frontmatter.",
    });
  } else {
    if (!frontmatter.name) {
      issues.push({
        code: "missing-frontmatter-name",
        message: "SKILL.md frontmatter must include a non-empty name.",
      });
    }

    if (!frontmatter.description) {
      issues.push({
        code: "missing-frontmatter-description",
        message: "SKILL.md frontmatter must include a non-empty description.",
      });
    }
  }

  if (DEBUG_PHRASE_PATTERN.test(markdown)) {
    issues.push({
      code: "debug-phrase",
      message: "SKILL.md must not include debug phrasing such as directive(s).",
    });
  }

  if (containsSecretMaterial(markdown)) {
    issues.push({
      code: "secret-material",
      message: "SKILL.md must not include obvious secret material.",
    });
  }

  if (ENV_PAYLOAD_PATTERN.test(markdown)) {
    issues.push({
      code: "env-payload",
      message: "SKILL.md must not include .env payloads or generated artifact environment dumps.",
    });
  }

  return issues;
}

export function assertValidSkillMarkdown(markdown: string): void {
  const issues = lintSkillMarkdown(markdown);
  if (issues.length === 0) {
    return;
  }

  const details = issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
  throw new CliUsageError(`Refusing to write invalid SKILL.md: ${details}`);
}

function parseFrontmatter(markdown: string): { name?: string; description?: string } | null {
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== "---") {
    return null;
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (endIndex < 0) {
    return null;
  }

  const fields: { name?: string; description?: string } = {};
  for (const line of lines.slice(1, endIndex)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    const key = match[1];
    const value = unquoteFrontmatterValue(match[2]?.trim() ?? "");
    if (key === "name" && value.length > 0) {
      fields.name = value;
    }
    if (key === "description" && value.length > 0) {
      fields.description = value;
    }
  }

  return fields;
}

function unquoteFrontmatterValue(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}
