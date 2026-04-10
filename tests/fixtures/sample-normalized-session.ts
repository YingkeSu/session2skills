import type { NormalizedSession } from "../../src/normalize/models.js";

export const sampleNormalizedSessions: Array<NormalizedSession> = [
  {
    id: "ses_1",
    title: "Inspect before editing",
    directory: "/tmp/project",
    updatedAt: 1,
    summaryText: "files=2, additions=10, deletions=1",
    diffSummary: {
      filesChanged: 2,
      additions: 10,
      deletions: 1,
      files: ["src/a.ts", "src/b.ts"],
    },
    messages: [
      {
        id: "msg_1",
        role: "user",
        timestamp: 1,
        text: "Please analyze the repository first and explain your reasoning.",
        parts: [],
        toolInvocations: [],
        evidence: {
          sessionID: "ses_1",
          messageID: "msg_1",
          sourceType: "message",
          excerpt: "Please analyze the repository first and explain your reasoning.",
        },
      },
    ],
    toolInvocations: [
      {
        id: "tool_1",
        toolName: "read",
        status: "completed",
        evidence: {
          sessionID: "ses_1",
          messageID: "msg_1",
          partID: "part_1",
          sourceType: "tool",
          excerpt: "read src/a.ts",
        },
      },
      {
        id: "tool_2",
        toolName: "lsp_diagnostics",
        status: "completed",
        input: { filePath: "src/a.ts" },
        evidence: {
          sessionID: "ses_1",
          messageID: "msg_1",
          partID: "part_2",
          sourceType: "tool",
          excerpt: "lsp_diagnostics src/a.ts",
        },
      },
    ],
  },
];
