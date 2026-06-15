import path from "node:path";

import { CliUsageError } from "../shared/errors.js";
import type { SkillIntent } from "../normalize/models.js";
import { stringifyRedactedJson } from "../shared/redaction.js";
import { writeDirectoryArtifacts } from "./staged-directory-write.js";

export type SkillManifestSchemaVersion = "skill-manifest/v1";

export type SkillManifest = {
  schemaVersion: SkillManifestSchemaVersion;
  skillID: string;
  name: string;
  description: string;
  generatedAt: string;
  sourceRunID?: string;
  status: "active" | "archived";
  files: Array<string>;
};

export type SkillProvenance = {
  schemaVersion: "skill-provenance/v1";
  skillID: string;
  sourceSessionIDs: Array<string>;
  sourceDirectory: string;
  generatedAt: string;
  claimIDs: Array<string>;
};

export function validateSkillID(skillID: string): void {
  if (!skillID || skillID.trim().length === 0) {
    throw new CliUsageError("skillID must be a non-empty string");
  }
  if (skillID.includes("/") || skillID.includes("\\") || skillID.includes("..")) {
    throw new CliUsageError(`Invalid skillID: "${skillID}" — must not contain "/", "\\", or ".."`);
  }
  if (skillID.startsWith(".")) {
    throw new CliUsageError(`Invalid skillID: "${skillID}" — must not start with "."`);
  }
}

export async function writeSkillToStore(input: {
  storeRoot: string;
  skillID: string;
  skillMarkdown: string;
  manifest: SkillManifest;
  provenance?: SkillProvenance;
  skillIntent?: SkillIntent;
  lineage?: unknown;
  force: boolean;
}): Promise<{
  skillPath: string;
  manifestPath: string;
  provenancePath: string | null;
  skillIntentPath: string | null;
  lineagePath: string | null;
}> {
  validateSkillID(input.skillID);

  const outputDirectory = path.join(input.storeRoot, "active", input.skillID);

  const files: Record<string, string> = {
    "SKILL.md": input.skillMarkdown,
    "skill-manifest.json": stringifyRedactedJson(input.manifest),
  };

  if (input.provenance) {
    files["provenance.json"] = stringifyRedactedJson(input.provenance);
  }
  if (input.skillIntent) {
    files["skill-intent.json"] = stringifyRedactedJson(input.skillIntent);
  }
  if (input.lineage) {
    files["lineage.json"] = stringifyRedactedJson(input.lineage);
  }

  const paths = await writeDirectoryArtifacts({
    outputDirectory,
    files,
    force: input.force,
  });

  return {
    skillPath: paths["SKILL.md"]!,
    manifestPath: paths["skill-manifest.json"]!,
    provenancePath: paths["provenance.json"] ?? null,
    skillIntentPath: paths["skill-intent.json"] ?? null,
    lineagePath: paths["lineage.json"] ?? null,
  };
}
