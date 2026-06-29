import type { LLMTraceSummary } from "../runs.js";
import type { JSX } from "react";
import { useLocale } from "../i18n/LocaleContext.js";

type PreviewTracesTabProps = {
  skillMarkdown: string | null;
  writerSections: Record<string, unknown> | null;
  traces: Array<Record<string, unknown>>;
};

type WriterDirectivePreview = {
  text: string;
  sourceClaimId: string | null;
};

type WriterSectionPreview = {
  title: string;
  summary: string | null;
  directives: Array<WriterDirectivePreview>;
  groundingClaimIds: Array<string>;
};

const stageColors: Record<string, string> = {
  analyst: "var(--cat-blue)",
  skeptic: "var(--cat-rose)",
  writer: "var(--cat-violet)",
  verifier: "var(--cat-teal)",
};

const MAX_MARKDOWN_LINES = 500;
const MAX_CODE_BLOCK_LINES = 120;

function extractTraceSummary(
  trace: Record<string, unknown>
): LLMTraceSummary {
  const stage = typeof trace.stage === "string" ? trace.stage : "unknown";
  const model = typeof trace.model === "string" ? trace.model : "unknown";
  const provider =
    typeof trace.provider === "string" ? trace.provider : "unknown";

  const usageSource =
    trace.usage && typeof trace.usage === "object"
      ? (trace.usage as Record<string, unknown>)
      : null;
  const usage = {
    promptTokens: typeof usageSource?.inputTokens === "number" ? usageSource.inputTokens : 0,
    completionTokens: typeof usageSource?.outputTokens === "number" ? usageSource.outputTokens : 0,
    totalTokens: typeof usageSource?.totalTokens === "number" ? usageSource.totalTokens : 0,
  };

  const latencyMs =
    typeof trace.latencyMs === "number" ? trace.latencyMs : undefined;

  const finishReason =
    typeof trace.finishReason === "string" ? trace.finishReason : undefined;

  const promptName =
    typeof trace.promptName === "string" ? trace.promptName : undefined;

  const requestPromptName =
    typeof trace.requestPromptName === "string"
      ? trace.requestPromptName
      : undefined;

  return {
    stage,
    model,
    provider,
    usage,
    latencyMs,
    finishReason,
    promptName,
    requestPromptName,
  };
}

function extractWriterSections(
  writerSections: Record<string, unknown> | null,
): Array<WriterSectionPreview> {
  if (!writerSections || !Array.isArray(writerSections.sections)) {
    return [];
  }

  return writerSections.sections.flatMap(
    (section): Array<WriterSectionPreview> => {
      if (typeof section !== "object" || section === null) {
        return [];
      }

      const source = section as Record<string, unknown>;
      const title = typeof source.title === "string" ? source.title.trim() : "";
      const summary =
        typeof source.summary === "string" && source.summary.trim().length > 0
          ? source.summary.trim()
          : null;
      const directives = Array.isArray(source.directives)
        ? source.directives.flatMap(
            (directive): Array<WriterDirectivePreview> => {
              if (typeof directive !== "object" || directive === null) {
                return [];
              }

              const directiveSource = directive as Record<string, unknown>;
              const text =
                typeof directiveSource.text === "string"
                  ? directiveSource.text.trim()
                  : "";
              if (!text) {
                return [];
              }

              return [
                {
                  text,
                  sourceClaimId:
                    typeof directiveSource.sourceClaimId === "string"
                      ? directiveSource.sourceClaimId
                      : null,
                },
              ];
            },
          )
        : [];
      const groundingClaimIds = Array.isArray(source.groundingClaimIds)
        ? source.groundingClaimIds.filter(
            (claimId): claimId is string => typeof claimId === "string",
          )
        : [];

      if (!title && !summary && directives.length === 0) {
        return [];
      }

      return [
        {
          title: title || "Untitled section",
          summary,
          directives,
          groundingClaimIds,
        },
      ];
    },
  );
}

function renderMarkdown(md: string): JSX.Element {
  const allLines = md.split(/\r?\n/);
  const wasTruncated = allLines.length > MAX_MARKDOWN_LINES;
  const lines = allLines.slice(0, MAX_MARKDOWN_LINES);
  const elements: JSX.Element[] = [];
  let listKey = 0;
  let codeBlockKey = 0;
  let paragraphKey = 0;
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeBlockTruncated = false;
  let listItems: string[] = [];

  function flushList(): JSX.Element | null {
    if (listItems.length === 0) return null;
    const items = [...listItems];
    listItems = [];
    listKey += 1;
    return (
      <ul
        key={`list-${listKey}`}
        style={{ margin: "4px 0", paddingLeft: "20px" }}
      >
        {items.map((item, idx) => (
          <li
            key={idx}
            style={{ marginBottom: "4px", lineHeight: 1.5 }}
          >
            {item}
          </li>
        ))}
      </ul>
    );
  }

  function flushCodeBlock(): JSX.Element | null {
    if (!inCodeBlock && codeLines.length === 0) return null;
    const text = codeBlockTruncated
      ? `${codeLines.join("\n")}\n... code block truncated after ${MAX_CODE_BLOCK_LINES} lines`
      : codeLines.join("\n");
    codeLines = [];
    codeBlockTruncated = false;
    inCodeBlock = false;
    codeBlockKey += 1;
    return (
      <pre
        key={`code-${codeBlockKey}`}
        style={{
          margin: "0 0 10px",
          padding: "10px",
          borderRadius: "4px",
          background: "var(--surface-2)",
          border: "1px solid var(--border-soft)",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        <code>{text}</code>
      </pre>
    );
  }

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      const listEnd = flushList();
      if (listEnd) elements.push(listEnd);

      if (inCodeBlock) {
        const codeBlock = flushCodeBlock();
        if (codeBlock) elements.push(codeBlock);
      } else {
        inCodeBlock = true;
        codeLines = [];
        codeBlockTruncated = false;
      }
      continue;
    }

    if (inCodeBlock) {
      if (codeLines.length < MAX_CODE_BLOCK_LINES) {
        codeLines.push(line);
      } else {
        codeBlockTruncated = true;
      }
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);

    if (headingMatch) {
      const listEnd = flushList();
      if (listEnd) elements.push(listEnd);

      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      const size = level <= 2 ? "18px" : level <= 4 ? "16px" : "14px";
      elements.push(
        <Tag
          key={`heading-${elements.length}`}
          style={{
            margin: `${level === 1 ? "16" : "12"}px 0 8px`,
            fontSize: size,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {text}
        </Tag>
      );
      continue;
    }

    if (listMatch) {
      listItems.push(listMatch[1]);
      continue;
    }

    const listEnd = flushList();
    if (listEnd) elements.push(listEnd);

    if (line.trim() === "") {
      continue;
    }

    paragraphKey += 1;
    elements.push(
      <p
        key={`p-${paragraphKey}`}
        style={{
          margin: "0 0 8px",
          lineHeight: 1.6,
          color: "var(--ink)",
        }}
      >
        {line}
      </p>
    );
  }

  const trailingList = flushList();
  if (trailingList) elements.push(trailingList);

  const trailingCodeBlock = flushCodeBlock();
  if (trailingCodeBlock) elements.push(trailingCodeBlock);

  if (wasTruncated) {
    elements.push(
      <p
        key="markdown-truncated"
        style={{
          margin: "8px 0 0",
          color: "var(--ink-muted)",
          fontStyle: "italic",
        }}
      >
        Preview truncated after {MAX_MARKDOWN_LINES} lines.
      </p>,
    );
  }

  return <>{elements}</>;
}

export function PreviewTracesTab({
  skillMarkdown,
  writerSections,
  traces,
}: PreviewTracesTabProps): JSX.Element {
  const { t, tEnum } = useLocale();
  const writerSectionPreviews = extractWriterSections(writerSections);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{t("preview.skillTitle")}</h3>
        {skillMarkdown == null ? (
          <p style={{ color: "var(--ink-muted)" }}>{t("preview.noSkill")}</p>
        ) : (
          <div style={markdownBoxStyle}>
            {renderMarkdown(skillMarkdown)}
          </div>
        )}
      </section>

      {writerSectionPreviews.length > 0 && (
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>{t("preview.writerSectionsTitle")}</h3>
          <div style={writerSectionsGridStyle}>
            {writerSectionPreviews.map((section, sectionIndex) => (
              <article
                key={`${section.title}-${sectionIndex}`}
                style={writerSectionCardStyle}
              >
                <div style={writerSectionHeaderStyle}>
                  <strong>{section.title}</strong>
                  {section.groundingClaimIds.length > 0 && (
                    <span style={traceMetaStyle}>
                      {section.groundingClaimIds.join(", ")}
                    </span>
                  )}
                </div>
                {section.summary && (
                  <p style={writerSectionSummaryStyle}>{section.summary}</p>
                )}
                {section.directives.length > 0 && (
                  <ul style={writerDirectiveListStyle}>
                    {section.directives.map((directive, directiveIndex) => (
                      <li key={`${directive.text}-${directiveIndex}`}>
                        <span>{directive.text}</span>
                        {directive.sourceClaimId && (
                          <span style={writerClaimStyle}>
                            {directive.sourceClaimId}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{t("preview.tracesTitle")}</h3>
        {traces.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>{t("preview.noTraces")}</p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {traces.map((trace, idx) => {
              const summary = extractTraceSummary(trace);
              return (
                <details
                  key={`trace-${idx}`}
                  style={traceCardStyle}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      listStyle: "none",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--ink-on-fill)",
                          background:
                            stageColors[summary.stage] ?? "var(--cat-gray)",
                        }}
                      >
                        {tEnum("stage", summary.stage)}
                      </span>
                      <span style={{ fontSize: "13px", fontWeight: 500 }}>
                        {summary.model}
                      </span>
                    </span>
                    <span style={traceMetaStyle}>
                      {summary.usage.totalTokens} {t("preview.tokens")}
                      {summary.latencyMs
                        ? ` · ${summary.latencyMs}ms`
                        : ""}
                    </span>
                  </summary>

                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "13px",
                      color: "var(--ink-2)",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: "6px",
                      overflowWrap: "anywhere",
                    }}
                  >
                    <div>
                      <strong>{t("preview.provider")}</strong> {summary.provider}
                    </div>
                    <div>
                      <strong>{t("preview.promptTokens")}</strong>{" "}
                      {summary.usage.promptTokens}
                    </div>
                    <div>
                      <strong>{t("preview.completionTokens")}</strong>{" "}
                      {summary.usage.completionTokens}
                    </div>
                    <div>
                      <strong>{t("preview.totalTokens")}</strong>{" "}
                      {summary.usage.totalTokens}
                    </div>
                    {summary.latencyMs != null && (
                      <div>
                        <strong>{t("preview.latency")}</strong> {summary.latencyMs}ms
                      </div>
                    )}
                    {summary.finishReason && (
                      <div>
                        <strong>{t("preview.finishReason")}</strong>{" "}
                        {summary.finishReason}
                      </div>
                    )}
                    {(summary.promptName || summary.requestPromptName) && (
                      <div>
                        <strong>{t("preview.prompt")}</strong>{" "}
                        {summary.promptName ??
                          summary.requestPromptName}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "var(--space-4)",
  background: "var(--surface)",
  minWidth: 0,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 var(--space-3)",
  fontSize: "var(--text-md)",
  fontWeight: 700,
  color: "var(--ink)",
};

const markdownBoxStyle: React.CSSProperties = {
  border: "1px solid var(--border-soft)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-4)",
  background: "var(--surface)",
  lineHeight: 1.6,
  overflowWrap: "anywhere",
  color: "var(--ink)",
};

const writerSectionsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "var(--space-3)",
};

const writerSectionCardStyle: React.CSSProperties = {
  border: "1px solid var(--border-soft)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-3)",
  background: "var(--surface-2)",
  minWidth: 0,
};

const writerSectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--space-2)",
  alignItems: "flex-start",
  flexWrap: "wrap",
  fontSize: "var(--text-sm)",
  color: "var(--ink)",
  overflowWrap: "anywhere",
};

const writerSectionSummaryStyle: React.CSSProperties = {
  margin: "var(--space-2) 0 0",
  fontSize: "var(--text-sm)",
  lineHeight: 1.45,
  color: "var(--ink-2)",
  overflowWrap: "anywhere",
};

const writerDirectiveListStyle: React.CSSProperties = {
  margin: "var(--space-2) 0 0",
  paddingLeft: "18px",
  fontSize: "var(--text-sm)",
  lineHeight: 1.5,
  color: "var(--ink)",
};

const writerClaimStyle: React.CSSProperties = {
  display: "inline-block",
  marginLeft: "var(--space-2)",
  color: "var(--ink-muted)",
  fontSize: "var(--text-xs)",
  overflowWrap: "anywhere",
};

const traceCardStyle: React.CSSProperties = {
  border: "1px solid var(--border-soft)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-3)",
  background: "var(--surface)",
  minWidth: 0,
};

const traceMetaStyle: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  color: "var(--ink-muted)",
  overflowWrap: "anywhere",
};
