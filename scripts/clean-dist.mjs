import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const distDirectory = path.resolve(repositoryRoot, "dist");

if (!distDirectory.startsWith(`${repositoryRoot}${path.sep}`)) {
  throw new Error(`Refusing to clean path outside repository: ${distDirectory}`);
}

await rm(distDirectory, { recursive: true, force: true });
