export type RawSessionSummary = {
  files: number;
  additions: number;
  deletions: number;
};

export type RawSession = {
  id: string;
  projectID?: string;
  workspaceID?: string;
  title: string;
  directory: string;
  updatedAt: number;
  summary?: RawSessionSummary;
};

export type RawSessionDiff = {
  file: string;
  additions: number;
  deletions: number;
};

export type RawMessageInfo = {
  id: string;
  sessionID: string;
  role: string;
  createdAt: number;
};

export type RawToolState = {
  status: string;
  title?: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  time?: {
    start?: number;
    end?: number;
  };
};

export type RawPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  description?: string;
  prompt?: string;
  tool?: string;
  callID?: string;
  state?: RawToolState;
  files?: Array<string>;
  name?: string;
};

export type RawMessage = {
  info: RawMessageInfo;
  parts: Array<RawPart>;
};

export type RawSessionMessages = Array<RawMessage>;
