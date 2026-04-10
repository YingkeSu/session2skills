import { Command } from "commander";

import { listRecentSessions } from "../../adapters/opencode/sessions.js";
import { parsePositiveInteger } from "../../shared/cli.js";
import { resolveProjectDirectory } from "../../shared/paths.js";

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
      const directory = resolveProjectDirectory(options.directory);
      const sessions = await listRecentSessions(
        {
          directory,
          workspace: options.workspace,
        },
        options.recent,
      );

      if (sessions.length === 0) {
        console.log(`No OpenCode sessions found for ${directory}.`);
        return;
      }

      console.log("sessionID\tupdatedAt\tworkspaceID\tprojectID\tdirectory\ttitle");

      for (const session of sessions) {
        const updatedAt = new Date(session.updatedAt).toISOString();
        console.log(`${session.id}\t${updatedAt}\t${session.workspaceID ?? "-"}\t${session.projectID}\t${session.directory}\t${session.title}`);
      }
    });
}
