import type { PreferenceProfile } from "../../src/normalize/models.js";

export const sampleProfile: PreferenceProfile = {
  workStyle: [
    {
      kind: "work-style",
      value: "analysis-first",
      weight: 3,
      evidence: [{ sessionID: "ses_1", sourceType: "message", excerpt: "Explore repository structure first" }],
    },
  ],
  communicationStyle: [
    {
      kind: "communication-style",
      value: "explanatory",
      weight: 2,
      evidence: [{ sessionID: "ses_1", sourceType: "message", excerpt: "Explain the why behind changes" }],
    },
  ],
  validationHabits: [
    {
      kind: "validation-habit",
      value: "run-diagnostics",
      weight: 2,
      evidence: [{ sessionID: "ses_1", sourceType: "tool", excerpt: "lsp_diagnostics" }],
    },
  ],
  constraints: [
    {
      kind: "constraint",
      value: "preserve-patterns",
      weight: 1,
      evidence: [{ sessionID: "ses_1", sourceType: "message", excerpt: "Follow existing patterns" }],
    },
  ],
  tokenEfficiency: [],
  modelSelection: [],
  delegationPattern: [],
  confidenceNotes: [
    "workStyle: strongest signal `analysis-first` with weight 3",
    "communicationStyle: strongest signal `explanatory` with weight 2",
    "validationHabits: strongest signal `run-diagnostics` with weight 2",
    "constraints: strongest signal `preserve-patterns` with weight 1",
  ],
};
