export type RawSessionSummary = {
  files: number;
  additions: number;
  deletions: number;
};

export type RawSessionModel = {
  id: string;
  providerID: string;
  variant?: string;
};

export type RawTokenUsage = {
  input: number;
  output: number;
  reasoning: number;
  cache: {
    read: number;
    write: number;
  };
};

export type RawMessagePath = {
  cwd: string;
  root: string;
};

export type RawSession = {
  id: string;
  projectID?: string;
  workspaceID?: string;
  title: string;
  directory: string;
  updatedAt: number;
  summary?: RawSessionSummary;
  parentID?: string;
  slug?: string;
  createdAt?: number;
  agent?: string;
  model?: RawSessionModel;
  cost?: number;
  tokens?: RawTokenUsage;
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
  agent?: string;
  mode?: string;
  modelID?: string;
  providerID?: string;
  cost?: number;
  tokens?: RawTokenUsage;
  path?: RawMessagePath;
  variant?: string;
  completedAt?: number;
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
  snapshot?: string;
  reason?: string;
  stepCost?: number;
  stepTokens?: RawTokenUsage;
};

export type RawMessage = {
  info: RawMessageInfo;
  parts: Array<RawPart>;
};

export type RawSessionMessages = Array<RawMessage>;
