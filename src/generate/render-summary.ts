import type { TonePreset } from "../shared/cli.js";

export type SummaryInput = {
  confidenceNotes: Array<string>;
};

export type SummaryOptions = {
  tone?: TonePreset;
};

export function renderSummary(input: SummaryInput, options: SummaryOptions = {}): string {
  const tone = options.tone ?? "balanced";
  const lines: Array<string> = [
    "# Session2Skills Audit Summary",
    "",
    `tone: ${tone}`,
    "",
    "## Confidence Notes",
    "",
  ];
  if (input.confidenceNotes.length > 0) {
    lines.push(...input.confidenceNotes.map((n) => `- ${n}`));
  } else {
    lines.push("- No additional confidence notes.");
  }
  lines.push("");
  return lines.join("\n");
}
