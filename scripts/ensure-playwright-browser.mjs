import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["playwright", "install", "chromium"], {
  stdio: "inherit",
  encoding: "utf-8",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
