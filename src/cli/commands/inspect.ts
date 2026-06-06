import { Command } from "commander";

import { createSessionProvider } from "../../adapters/registry.js";
import { parsePositiveInteger } from "../../shared/cli.js";
import { resolveProjectDirectory, validateProjectDirectory } from "../../shared/paths.js";

type InspectOptions = {
  directory?: string;
  workspace?: string;
  recent: number;
};

export function registerInspectCommand(program: Command): void {
  program
    .command("inspect")
    .description("List recent OpenCode sessions for a project directory")
    .option("-d, --directory <path>", "Target project directory")
    .option("-w, --workspace <id>", "Optional OpenCode workspace id")
    .option("-r, --recent <number>", "Number of recent sessions to inspect", parsePositiveInteger, 10)
    .action(async (options: InspectOptions) => {
      const directory = validateProjectDirectory(resolveProjectDirectory(options.directory));
      const providerOpts = { directory, workspace: options.workspace };
      const { provider, close } = await createSessionProvider(providerOpts);

      try {
        const sessions = await provider.listRecentSessions(providerOpts, options.recent);

        if (sessions.length === 0) {
          console.log(`No OpenCode sessions found for ${directory}.`);
          return;
        }

        console.log("sessionID\tupdatedAt\tworkspaceID\tprojectID\tdirectory\ttitle");

        for (const session of sessions) {
          const updatedAt = new Date(session.updatedAt).toISOString();
          console.log(`${session.id}\t${updatedAt}\t${session.workspaceID ?? "-"}\t${session.projectID}\t${session.directory}\t${session.title}`);
        }
      } finally {
        await close();
      }
    });
}
