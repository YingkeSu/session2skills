import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const targetDir = join(__dirname, "..", "dist-electron");

mkdirSync(targetDir, { recursive: true });
writeFileSync(join(targetDir, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2) + "\n");
