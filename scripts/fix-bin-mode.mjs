import { chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binPath = path.join(root, "dist", "cli", "main.js");

await chmod(binPath, 0o755);
