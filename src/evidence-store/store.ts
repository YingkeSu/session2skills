import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { EvidenceRecord, EvidenceSourceType } from "./types.js";

type EvidenceRow = {
  evidenceID: string;
  sessionID: string;
  messageID: string | null;
  partID: string | null;
  sourceType: string;
  rawText: string;
  excerpt: string;
  redacted: number;
  createdAt: number;
};

export class EvidenceStore {
  private readonly db: Database.Database;
  private readonly stmtPut: Database.Statement;
  private readonly stmtGet: Database.Statement;
  private readonly stmtGetExcerpt: Database.Statement;
  private readonly stmtGetRawMessage: Database.Statement;
  private readonly stmtHasSession: Database.Statement;
  private readonly stmtCount: Database.Statement;
  private closed = false;

  constructor(dbPath: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evidence (
        evidenceID TEXT PRIMARY KEY,
        sessionID TEXT NOT NULL,
        messageID TEXT,
        partID TEXT,
        sourceType TEXT NOT NULL,
        rawText TEXT NOT NULL,
        excerpt TEXT NOT NULL,
        redacted INTEGER NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_session ON evidence(sessionID);
      CREATE INDEX IF NOT EXISTS idx_evidence_message ON evidence(sessionID, messageID);
    `);

    this.stmtPut = this.db.prepare(`
      INSERT INTO evidence (evidenceID, sessionID, messageID, partID, sourceType, rawText, excerpt, redacted, createdAt)
      VALUES (@evidenceID, @sessionID, @messageID, @partID, @sourceType, @rawText, @excerpt, @redacted, @createdAt)
      ON CONFLICT(evidenceID) DO UPDATE SET
        sessionID = excluded.sessionID,
        messageID = excluded.messageID,
        partID = excluded.partID,
        sourceType = excluded.sourceType,
        rawText = excluded.rawText,
        excerpt = excluded.excerpt,
        redacted = excluded.redacted,
        createdAt = excluded.createdAt
    `);
    this.stmtGet = this.db.prepare("SELECT * FROM evidence WHERE evidenceID = ?");
    this.stmtGetExcerpt = this.db.prepare("SELECT excerpt FROM evidence WHERE evidenceID = ?");
    this.stmtGetRawMessage = this.db.prepare(
      "SELECT rawText FROM evidence WHERE sessionID = ? AND messageID = ? AND partID IS NULL AND sourceType = 'message' LIMIT 1",
    );
    this.stmtHasSession = this.db.prepare("SELECT 1 FROM evidence WHERE sessionID = ? LIMIT 1");
    this.stmtCount = this.db.prepare("SELECT COUNT(*) AS n FROM evidence");
  }

  put(record: EvidenceRecord): void {
    this.stmtPut.run({
      evidenceID: record.evidenceID,
      sessionID: record.sessionID,
      messageID: record.messageID ?? null,
      partID: record.partID ?? null,
      sourceType: record.sourceType,
      rawText: record.rawText,
      excerpt: record.excerpt,
      redacted: record.redacted ? 1 : 0,
      createdAt: record.createdAt,
    });
  }

  getRecord(evidenceID: string): EvidenceRecord | null {
    const row = this.stmtGet.get(evidenceID) as EvidenceRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  getExcerpt(evidenceID: string): string | null {
    const row = this.stmtGetExcerpt.get(evidenceID) as { excerpt: string } | undefined;
    return row ? row.excerpt : null;
  }

  getRawMessage(sessionID: string, messageID: string): string | null {
    const row = this.stmtGetRawMessage.get(sessionID, messageID) as { rawText: string } | undefined;
    return row ? row.rawText : null;
  }

  has(sessionID: string): boolean {
    return this.stmtHasSession.get(sessionID) !== undefined;
  }

  count(): number {
    const row = this.stmtCount.get() as { n: number };
    return row.n;
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }
}

function rowToRecord(row: EvidenceRow): EvidenceRecord {
  return {
    evidenceID: row.evidenceID,
    sessionID: row.sessionID,
    messageID: row.messageID ?? undefined,
    partID: row.partID ?? undefined,
    sourceType: row.sourceType as EvidenceSourceType,
    rawText: row.rawText,
    excerpt: row.excerpt,
    redacted: row.redacted === 1,
    createdAt: row.createdAt,
  };
}
