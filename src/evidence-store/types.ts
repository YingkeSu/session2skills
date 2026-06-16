export type EvidenceStoreSchemaVersion = "evidence-store/v1";

export const EVIDENCE_STORE_SCHEMA_VERSION: EvidenceStoreSchemaVersion = "evidence-store/v1";

export type EvidenceSourceType = "message" | "part" | "tool";

export type EvidenceRecord = {
  /** MUST equal makeEvidenceID(sessionID, messageID?, partID?) from harness/evidence-index. */
  evidenceID: string;
  sessionID: string;
  messageID?: string;
  partID?: string;
  sourceType: EvidenceSourceType;
  /** FULL redacted text, never truncated (contrast with excerpt). */
  rawText: string;
  /** 600-char excerpt, identical to EvidenceItem.summaryText from Phase 1. */
  excerpt: string;
  redacted: boolean;
  createdAt: number;
};
