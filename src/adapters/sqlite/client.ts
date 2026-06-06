import Database from "better-sqlite3";
import { OpenCodeAdapterError } from "../../shared/errors.js";
import { resolveOpenCodeDBPath } from "./paths.js";
import { validateSchema } from "./schema.js";

export type SqliteClientHandle = {
  db: Database.Database;
  close: () => void;
};

export function createSqliteClient(dbPath?: string): SqliteClientHandle {
  const resolvedPath = dbPath ?? resolveOpenCodeDBPath();

  let db: Database.Database;
  try {
    db = new Database(resolvedPath, { readonly: true });
  } catch (error) {
    throw new OpenCodeAdapterError(
      `Failed to open OpenCode DB at ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  try {
    validateSchema(db);
  } catch (error) {
    db.close();
    throw error;
  }

  return {
    db,
    close: () => db.close(),
  };
}
