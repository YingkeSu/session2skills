#!/usr/bin/env node

import { Command } from "commander";

import { registerAnalyzeCommand } from "./commands/analyze.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerInspectCommand } from "./commands/inspect.js";
import { CliUsageError, toErrorMessage } from "../shared/errors.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("session2skills")
    .description("Analyze local OpenCode sessions and generate a personalized workflow skill")
    .version("0.1.0");

  registerInspectCommand(program);
  registerAnalyzeCommand(program);
  registerGenerateCommand(program);

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = toErrorMessage(error);

  if (error instanceof CliUsageError) {
    console.error(message);
    process.exitCode = 1;
    return;
  }

  console.error(message);
  process.exitCode = 1;
});
