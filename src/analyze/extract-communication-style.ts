import type {
  CandidateClaim,
  CommunicationStyleLabel,
  NormalizedSession,
} from "../normalize/models.js";

import {
  confidenceFromCount,
  createRuleClaim,
  getUserMessages,
  toCitations,
} from "./helpers.js";

const CONSULTATIVE_PATTERN = /(\?|how|why|what|can you|could you|would you|是否|可行性|怎么|为什么|如何|能否|可以吗)/i;
const DIRECTIVE_PATTERN = /(implement|build|fix|add|generate|refactor|完成|实现|修复|添加|生成|重构|帮我)/i;

const EXTRACTOR_ID = "extract-communication-style";

export function extractCommunicationStyleClaims(sessions: Array<NormalizedSession>): Array<CandidateClaim<"communication-style">> {
  const userMessages = getUserMessages(sessions).filter((message) => message.text.trim().length > 0);

  if (userMessages.length === 0) {
    return [];
  }

  const totalMessages = userMessages.length;
  const averageLength =
    userMessages.reduce((total, message) => total + message.text.trim().length, 0) / totalMessages;
  const conciseEvidence = userMessages.filter((message) => message.text.trim().length <= averageLength).map((message) => message.evidence);
  const explanatoryEvidence = userMessages.filter((message) => message.text.trim().length > averageLength).map((message) => message.evidence);
  const consultativeEvidence = userMessages.filter((message) => CONSULTATIVE_PATTERN.test(message.text)).map((message) => message.evidence);
  const directiveEvidence = userMessages.filter((message) => DIRECTIVE_PATTERN.test(message.text)).map((message) => message.evidence);

  const claims: Array<CandidateClaim<"communication-style">> = [];

  if (averageLength <= 280 && conciseEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "concise",
      "communication-style",
      "concise" as CommunicationStyleLabel,
      confidenceFromCount(conciseEvidence.length, totalMessages),
      `Average message length ${Math.round(averageLength)} chars (<=280 threshold); ${conciseEvidence.length}/${totalMessages} messages are concise`,
      toCitations(conciseEvidence),
    ));
  }

  if (averageLength > 280 && explanatoryEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "explanatory",
      "communication-style",
      "explanatory" as CommunicationStyleLabel,
      confidenceFromCount(explanatoryEvidence.length, totalMessages),
      `Average message length ${Math.round(averageLength)} chars (>280 threshold); ${explanatoryEvidence.length}/${totalMessages} messages are explanatory`,
      toCitations(explanatoryEvidence),
    ));
  }

  if (consultativeEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "consultative",
      "communication-style",
      "consultative" as CommunicationStyleLabel,
      confidenceFromCount(consultativeEvidence.length, totalMessages),
      `Consultative language patterns found in ${consultativeEvidence.length}/${totalMessages} messages`,
      toCitations(consultativeEvidence),
    ));
  }

  if (directiveEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "directive",
      "communication-style",
      "directive" as CommunicationStyleLabel,
      confidenceFromCount(directiveEvidence.length, totalMessages),
      `Directive language patterns found in ${directiveEvidence.length}/${totalMessages} messages`,
      toCitations(directiveEvidence),
    ));
  }

  return claims.sort((a, b) => b.confidence - a.confidence);
}
