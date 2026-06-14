import { Command } from "commander";
import { serve } from "@hono/node-server";

import { createServer } from "../../server/app.js";
import { parsePositiveInteger } from "../../shared/cli.js";
import { resolveProjectDirectory, validateProjectDirectory, getDefaultGeneratedSkillsDirectory } from "../../shared/paths.js";

type ServeOptions = {
  directory?: string;
  port: number;
  host: string;
};

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start a local web server to browse generated harness runs")
    .option("-d, --directory <path>", "Target project directory")
    .option("-p, --port <number>", "HTTP port", parsePositiveInteger, 3000)
    .option("-H, --host <address>", "Hostname/IP to bind", "0.0.0.0")
    .action(async (options: ServeOptions) => {
      const directory = validateProjectDirectory(resolveProjectDirectory(options.directory));
      const runsDirectory = getDefaultGeneratedSkillsDirectory(directory);

      const app = createServer(runsDirectory);

      const server = serve(
        { fetch: app.fetch, port: options.port, hostname: options.host },
        (info) => {
          console.log(`Server running at http://localhost:${info.port}`);
          console.log(`Serving runs from ${runsDirectory}`);
        },
      );

      const shutdown = (signal: string) => {
        console.log(`\nReceived ${signal}, shutting down…`);
        server.close(() => {
          process.exit(0);
        });
      };

      process.on("SIGTERM", () => shutdown("SIGTERM"));
      process.on("SIGINT", () => shutdown("SIGINT"));

      server.on("error", (err: Error) => {
        if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
          console.error(`Port ${options.port} is already in use. Try a different --port.`);
          process.exit(1);
        }
        console.error(`Server error: ${err.message}`);
        process.exit(1);
      });

      await new Promise(() => {});
    });
}
