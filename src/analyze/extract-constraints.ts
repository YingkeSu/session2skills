import type {
  CandidateClaim,
  ConstraintLabel,
  NormalizedSession,
} from "../normalize/models.js";

import {
  confidenceFromCount,
  createRuleClaim,
  getUserMessages,
  toCitations,
} from "./helpers.js";

const CONSTRAINT_PATTERNS = {
  "minimal-diff": /(minimal diff|minimal changes|small diff|少改|尽量少改|最小.*修改)/i,
  "preserve-patterns": /(preserve existing patterns|follow existing patterns|match existing patterns|保持现有模式|遵循现有模式|不要破坏现有结构)/i,
  "type-safety": /(type safety|strict types|avoid any|类型安全|严格类型|不要.*any)/i,
  "avoid-destructive-actions": /(avoid destructive|don't .*reset|不要破坏|不要删除测试|避免破坏性|不要强推)/i,
} as const;

const EXTRACTOR_ID = "extract-constraints";

export function extractConstraintClaims(sessions: Array<NormalizedSession>): Array<CandidateClaim<"constraint">> {
  const userMessages = getUserMessages(sessions).filter((message) => message.text.trim().length > 0);
  const totalMessages = userMessages.length || 1;
  const claims: Array<CandidateClaim<"constraint">> = [];

  for (const [value, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
    const evidence = userMessages.filter((message) => pattern.test(message.text)).map((message) => message.evidence);

    if (evidence.length > 0) {
      claims.push(createRuleClaim(
        EXTRACTOR_ID,
        value,
        "constraint",
        value as ConstraintLabel,
        confidenceFromCount(evidence.length, totalMessages, true),
        `Explicit user constraint "${value}" found in ${evidence.length} message(s)`,
        toCitations(evidence),
      ));
    }
  }

  return claims.sort((a, b) => b.confidence - a.confidence);
}
