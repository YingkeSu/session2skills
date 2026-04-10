import type { RawSession, RawSessionDiff, RawSessionMessages } from "../../src/normalize/raw-session.js";

export const sampleSession: RawSession = {
  id: "ses_fixture",
  directory: "/tmp/project",
  title: "Fixture session",
  updatedAt: 2,
};

const userMessage: RawSessionMessages[number]["info"] = {
  id: "msg_fixture",
  sessionID: "ses_fixture",
  role: "user",
  createdAt: 1,
};

export const sampleMessages: RawSessionMessages = [
  {
    info: userMessage,
    parts: [
      {
        id: "part_text",
        sessionID: "ses_fixture",
        messageID: "msg_fixture",
        type: "text",
        text: "Please analyze the repository before changing files.",
      },
      {
        id: "part_tool",
        sessionID: "ses_fixture",
        messageID: "msg_fixture",
        type: "tool",
        callID: "call_1",
        tool: "read",
        state: {
          status: "completed",
          input: { filePath: "src/app.ts" },
          output: "file contents",
          title: "Read file",
          time: {
            start: 1,
            end: 2,
          },
        },
      },
    ],
  },
];

export const sampleDiffs: Array<RawSessionDiff> = [
  {
    file: "src/app.ts",
    additions: 1,
    deletions: 0,
  },
];
