import Database from "better-sqlite3";
import { OpenCodeAdapterError } from "../../shared/errors.js";

export type CodexClientHandle = {
  db: Database.Database;
  close: () => void;
};

export function createCodexClient(dbPath: string): CodexClientHandle {
  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (error) {
    throw new OpenCodeAdapterError(
      `Failed to open Codex DB at ${dbPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }

  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  } catch {
    // read-only connection cannot set WAL mode; ignore — query layer still works.
  }

  return {
    db,
    close: () => {
      try {
        db.close();
      } catch {
        // ignore double-close races.
      }
    },
  };
}
