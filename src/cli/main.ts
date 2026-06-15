#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { registerAnalyzeCommand } from "./commands/analyze.js";
import { registerEvaluateCommand } from "./commands/evaluate.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerInspectCommand } from "./commands/inspect.js";
import { registerServeCommand } from "./commands/serve.js";
import { CliUsageError, toErrorMessage } from "../shared/errors.js";

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
  registerAnalyzeCommand(program);
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
