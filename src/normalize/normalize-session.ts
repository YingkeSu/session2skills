import type {
  EvidenceRef,
  NormalizedDiffSummary,
  NormalizedMessage,
  NormalizedPart,
  NormalizedSession,
  NormalizedStep,
  ToolInvocation,
} from "./models.js";
import type { RawPart, RawSession, RawSessionDiff, RawSessionMessages } from "./raw-session.js";

type NormalizeSessionInput = {
  session: RawSession;
  messages: RawSessionMessages;
  diff?: Array<RawSessionDiff>;
  maxToolOutputChars?: number;
};

export function normalizeSession(input: NormalizeSessionInput): NormalizedSession {
  const maxToolOutput = input.maxToolOutputChars ?? 10000;
  const normalizedMessages = input.messages.map((m) => normalizeMessage(m, maxToolOutput));
  const toolInvocations = normalizedMessages.flatMap((message) => message.toolInvocations);
  const steps = buildSteps(input.messages);

  return {
    id: input.session.id,
    title: input.session.title,
    directory: input.session.directory,
    updatedAt: input.session.updatedAt,
    summaryText: input.session.summary ? formatSessionSummary(input.session.summary) : undefined,
    diffSummary: input.diff ? summarizeDiffs(input.diff) : undefined,
    messages: normalizedMessages,
    toolInvocations,
    steps,
    parentID: input.session.parentID,
    agent: input.session.agent,
    model: input.session.model,
    cost: input.session.cost,
    tokens: input.session.tokens,
  };
}

function normalizeMessage(messageBundle: RawSessionMessages[number], maxToolOutput: number): NormalizedMessage {
  const parts = messageBundle.parts.map((p) => normalizePart(p, maxToolOutput));
  const toolInvocations = messageBundle.parts.flatMap(normalizeToolInvocation);

  return {
    id: messageBundle.info.id,
    role: messageBundle.info.role,
    timestamp: messageBundle.info.createdAt,
    text: extractMessageText(messageBundle.parts),
    parts,
    toolInvocations,
    evidence: {
      sessionID: messageBundle.info.sessionID,
      messageID: messageBundle.info.id,
      sourceType: "message",
      excerpt: extractMessageText(messageBundle.parts).slice(0, 600) || undefined,
    },
    agent: messageBundle.info.agent,
    modelID: messageBundle.info.modelID,
    providerID: messageBundle.info.providerID,
    cost: messageBundle.info.cost,
    tokens: messageBundle.info.tokens,
  };
}

function normalizePart(part: RawPart, maxToolOutput: number): NormalizedPart {
  switch (part.type) {
    case "text":
    case "reasoning":
      return {
        id: part.id,
        type: part.type,
        text: part.text ?? "",
        evidence: createPartEvidence(part, part.text ?? ""),
      };
    case "subtask":
      {
        const subtaskText = `${part.description ?? ""}\n${part.prompt ?? ""}`.trim();

        return {
          id: part.id,
          type: part.type,
          text: subtaskText,
          evidence: createPartEvidence(part, subtaskText),
        };
      }
    case "tool":
      return {
        id: part.id,
        type: part.type,
        toolName: part.tool,
        status: part.state?.status,
        title: part.state?.status === "running" || part.state?.status === "completed" ? part.state.title : undefined,
        text: part.state?.status === "completed"
          ? part.state.output?.slice(0, maxToolOutput)
          : part.state?.status === "error"
            ? part.state.error
            : undefined,
        evidence: createPartEvidence(part),
      };
    case "patch":
        return {
          id: part.id,
          type: part.type,
          files: part.files ?? [],
          evidence: createPartEvidence(part),
        };
    case "agent":
      return {
        id: part.id,
        type: part.type,
        text: part.name ?? "",
        evidence: createPartEvidence(part, part.name ?? ""),
      };
    case "step-start":
    case "step-finish":
      return {
        id: part.id,
        type: part.type,
        evidence: createPartEvidence(part),
      };
    default:
      return {
        id: part.id,
        type: part.type,
        evidence: createPartEvidence(part),
      };
  }
}

function normalizeToolInvocation(part: RawPart): Array<ToolInvocation> {
  if (part.type !== "tool") {
    return [];
  }

  const startedAt = part.state?.time?.start;
  const endedAt =
    part.state?.status === "completed" || part.state?.status === "error"
      ? part.state.time?.end
      : undefined;

  return [
    {
      id: part.id,
      toolName: part.tool ?? "unknown",
      status: part.state?.status ?? "unknown",
      title: part.state?.status === "running" || part.state?.status === "completed" ? part.state.title : undefined,
      input: part.state?.input,
      output: part.state?.status === "completed" ? part.state.output : undefined,
      startedAt,
      endedAt,
      evidence: createPartEvidence(part),
    },
  ];
}

function buildSteps(messages: RawSessionMessages): Array<NormalizedStep> {
  const stepPairs: Array<{
    sessionID: string;
    start?: RawPart & { type: "step-start" };
    finish?: RawPart & { type: "step-finish" };
  }> = [];

  let currentPair: typeof stepPairs[number] | undefined;

  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "step-start") {
        if (currentPair?.finish) {
          stepPairs.push(currentPair);
        }
        currentPair = {
          sessionID: part.sessionID,
          start: part as RawPart & { type: "step-start" },
        };
      } else if (part.type === "step-finish" && currentPair) {
        currentPair.finish = part as RawPart & { type: "step-finish" };
        stepPairs.push(currentPair);
        currentPair = undefined;
      }
    }
  }

  if (currentPair) {
    stepPairs.push(currentPair);
  }

  return stepPairs.map((pair, index) => {
    const start = pair.start;
    const finish = pair.finish;
    const startId = start?.id ?? `step-${index}`;

    return {
      id: startId,
      startSnapshot: start?.snapshot,
      endSnapshot: finish?.snapshot,
      duration: undefined,
      cost: finish?.stepCost,
      tokens: finish?.stepTokens,
      reason: finish?.reason,
      evidence: {
        sessionID: pair.sessionID,
        partID: startId,
        sourceType: "part",
      } satisfies EvidenceRef,
    };
  });
}

function extractMessageText(parts: Array<RawPart>): string {
  return parts
    .flatMap((part) => {
      switch (part.type) {
        case "text":
        case "reasoning":
          return [part.text ?? ""];
        case "subtask":
          return [part.description ?? "", part.prompt ?? ""];
        case "agent":
          return [part.name ?? ""];
        default:
          return [];
      }
    })
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function formatSessionSummary(summary: NonNullable<RawSession["summary"]>): string {
  const parts = [
    `files=${summary.files}`,
    `additions=${summary.additions}`,
    `deletions=${summary.deletions}`,
  ];

  return parts.join(", ");
}

function summarizeDiffs(diffs: Array<RawSessionDiff>): NormalizedDiffSummary {
  return {
    filesChanged: diffs.length,
    additions: diffs.reduce((total, diff) => total + diff.additions, 0),
    deletions: diffs.reduce((total, diff) => total + diff.deletions, 0),
    files: diffs.map((diff) => diff.file),
  };
}

function createPartEvidence(part: RawPart, excerpt?: string): EvidenceRef {
  return {
    sessionID: part.sessionID,
    messageID: part.messageID,
    partID: part.id,
    sourceType: part.type === "tool" ? "tool" : "part",
    excerpt: excerpt?.slice(0, 600),
  };
}
