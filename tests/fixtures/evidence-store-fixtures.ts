import type {
  EvidenceRef,
  NormalizedMessage,
  NormalizedPart,
  NormalizedSession,
  ToolInvocation,
} from "../../src/normalize/models.js";

function ref(
  sessionID: string,
  sourceType: EvidenceRef["sourceType"],
  messageID?: string,
  partID?: string,
): EvidenceRef {
  return { sessionID, messageID, partID, sourceType };
}

export type PartSpec = {
  id: string;
  text?: string;
  title?: string;
  toolName?: string;
  type?: string;
  status?: string;
};

export function buildPart(sessionID: string, messageID: string, spec: PartSpec): NormalizedPart {
  return {
    id: spec.id,
    type: spec.type ?? (spec.toolName ? "tool" : "text"),
    text: spec.text,
    title: spec.title,
    toolName: spec.toolName,
    status: spec.status,
    evidence: ref(sessionID, spec.toolName ? "tool" : "part", messageID, spec.id),
  };
}

export type MessageSpec = {
  id: string;
  role?: string;
  text: string;
  parts?: Array<PartSpec>;
  tools?: Array<ToolSpec>;
};

export type ToolSpec = {
  id: string;
  toolName: string;
  title?: string;
  input?: Record<string, unknown>;
  output?: string;
};

export function buildMessage(sessionID: string, spec: MessageSpec): NormalizedMessage {
  return {
    id: spec.id,
    role: spec.role ?? "user",
    timestamp: 1,
    text: spec.text,
    parts: (spec.parts ?? []).map((p) => buildPart(sessionID, spec.id, p)),
    toolInvocations: (spec.tools ?? []).map((t) => buildTool(sessionID, spec.id, t)),
    evidence: ref(sessionID, "message", spec.id),
  };
}

export function buildTool(sessionID: string, messageID: string, spec: ToolSpec): ToolInvocation {
  return {
    id: spec.id,
    toolName: spec.toolName,
    status: "completed",
    title: spec.title,
    input: spec.input,
    output: spec.output,
    startedAt: 1,
    endedAt: 2,
    evidence: ref(sessionID, "tool", messageID),
  };
}

export type SessionSpec = {
  id: string;
  title?: string;
  directory?: string;
  messages?: Array<MessageSpec>;
  tools?: Array<ToolSpec>;
};

export function buildSession(spec: SessionSpec): NormalizedSession {
  return {
    id: spec.id,
    title: spec.title ?? `session ${spec.id}`,
    directory: spec.directory ?? "/tmp/project",
    updatedAt: 2,
    messages: (spec.messages ?? []).map((m) => buildMessage(spec.id, m)),
    toolInvocations: (spec.tools ?? []).map((t) => buildTool(spec.id, "", t)),
    steps: [],
  };
}

export function buildSessions(specs: Array<SessionSpec>): Array<NormalizedSession> {
  return specs.map(buildSession);
}
