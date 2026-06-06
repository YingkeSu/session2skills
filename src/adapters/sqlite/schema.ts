import type Database from "better-sqlite3";
import { OpenCodeAdapterError } from "../../shared/errors.js";

export type SchemaInfo = {
  version: number;
  migrations: Array<string>;
};

export function validateSchema(db: Database.Database): void {
  const requiredTables = new Set(["session", "message", "part"]);

  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ).all() as Array<{ name: string }>;

  const existing = new Set(tables.map((t) => t.name));

  const missing = [...requiredTables].filter((t) => !existing.has(t));
  if (missing.length > 0) {
    throw new OpenCodeAdapterError(
      `OpenCode DB schema missing required tables: ${[...missing].join(", ")}`,
    );
  }
}
