#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { registerEvaluateCommand } from "./commands/evaluate.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerInspectCommand } from "./commands/inspect.js";
import { registerServeCommand } from "./commands/serve.js";
import { CliUsageError, toErrorMessage } from "../shared/errors.js";

function loadDotEnv(): void {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const packageVersion: string = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
).version;

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") {
    process.exit(0);
  }
});

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("session2skills")
    .description("Analyze local OpenCode sessions and generate a personalized workflow skill")
    .version(packageVersion);

  registerInspectCommand(program);
  registerEvaluateCommand(program);
  registerGenerateCommand(program);
  registerServeCommand(program);

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = toErrorMessage(error);

  if (error instanceof CliUsageError) {
    console.error(message);
  } else {
    console.error(`Error: ${message}`);
  }
  process.exitCode = 1;
});
