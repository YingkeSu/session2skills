import type {
  RawSession,
  RawSessionDiff,
  RawSessionMessages,
} from "../normalize/raw-session.js";

export type SessionProviderOptions = {
  directory: string;
  workspace?: string;
};

export type SessionProvider = {
  listRecentSessions(
    options: SessionProviderOptions,
    recent: number,
  ): Promise<Array<RawSession>>;

  getSession(
    options: SessionProviderOptions,
    sessionID: string,
  ): Promise<RawSession>;

  getSessionMessages(
    options: SessionProviderOptions,
    sessionID: string,
    limit?: number,
  ): Promise<RawSessionMessages>;

  getSessionDiff(
    options: SessionProviderOptions,
    sessionID: string,
    messageID?: string,
  ): Promise<Array<RawSessionDiff>>;

  close?: () => Promise<void>;
};
