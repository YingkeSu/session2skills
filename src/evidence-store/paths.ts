import path from "node:path";

export function getDefaultEvidenceStorePath(rootDirectory: string): string {
  return path.join(rootDirectory, ".session2skills", "evidence-store.db");
}
