import { redactSecretsFromString } from "./redaction.js";

export const MAX_EXCERPT_CHARS = 600;
export const CHARS_PER_TOKEN = 4;

export function makeEvidenceID(
  sessionID: string,
  messageID?: string,
  partID?: string,
): string {
  if (!messageID) return sessionID;
  if (!partID) return `${sessionID}:${messageID}`;
  return `${sessionID}:${messageID}:${partID}`;
}

export function makeExcerpt(text: string, maxChars = MAX_EXCERPT_CHARS): string {
  const trimmed = redactSecretsFromString(text).trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cutoff = trimmed.lastIndexOf(" ", maxChars - 3);
  const sliceEnd = cutoff > maxChars * 0.6 ? cutoff : maxChars - 3;
  return trimmed.slice(0, sliceEnd) + "...";
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
