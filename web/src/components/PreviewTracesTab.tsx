import type { LLMTraceSummary } from "../runs.js";
import type { JSX } from "react";
import { useLocale } from "../i18n/LocaleContext.js";
import { VirtualList } from "./VirtualList.js";
import { RawJsonDrawer } from "./RawJsonDrawer.js";

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

// Stage → categorical badge fill. One consistent color per harness stage
// across the trace list and the pipeline strip.
const stageBadge: Record<string, string> = {
  analyst: "s2s-badge-blue",
  skeptic: "s2s-badge-rose",
  writer: "s2s-badge-violet",
  verifier: "s2s-badge-teal",
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

// Minimal, safe markdown rendering: every line becomes a semantic element
// inside .s2s-prose, so the CSS owns the typography and renderMarkup stays
// free of inline styles. Raw HTML in source text is rendered as text only.
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
      <ul key={`list-${listKey}`}>
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
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
      <pre key={`code-${codeBlockKey}`}>
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
      elements.push(
        <Tag key={`heading-${elements.length}`}>{text}</Tag>,
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
    elements.push(<p key={`p-${paragraphKey}`}>{line}</p>);
  }

  const trailingList = flushList();
  if (trailingList) elements.push(trailingList);

  const trailingCodeBlock = flushCodeBlock();
  if (trailingCodeBlock) elements.push(trailingCodeBlock);

  if (wasTruncated) {
    elements.push(
      <p key="markdown-truncated" className="s2s-prose-truncated">
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
    <div className="s2s-stack">
      <section className="s2s-panel">
        <div className="s2s-panel-head">
          <h3 className="s2s-panel-title">{t("preview.skillTitle")}</h3>
        </div>
        {skillMarkdown == null ? (
          <p className="s2s-empty">{t("preview.noSkill")}</p>
        ) : (
          <div className="s2s-prose">{renderMarkdown(skillMarkdown)}</div>
        )}
      </section>

      {writerSectionPreviews.length > 0 && (
        <section className="s2s-panel">
          <div className="s2s-panel-head">
            <h3 className="s2s-panel-title">
              {t("preview.writerSectionsTitle")}
            </h3>
          </div>
          <div className="s2s-writer-grid">
            {writerSectionPreviews.map((section, sectionIndex) => (
              <article
                key={`${section.title}-${sectionIndex}`}
                className="s2s-tile s2s-tile-muted"
              >
                <div className="s2s-writer-head">
                  <strong>{section.title}</strong>
                  {section.groundingClaimIds.length > 0 && (
                    <span className="s2s-chip s2s-chip-muted">
                      {section.groundingClaimIds.join(", ")}
                    </span>
                  )}
                </div>
                {section.summary && (
                  <p className="s2s-writer-summary">{section.summary}</p>
                )}
                {section.directives.length > 0 && (
                  <ul className="s2s-writer-list">
                    {section.directives.map((directive, directiveIndex) => (
                      <li key={`${directive.text}-${directiveIndex}`}>
                        <span>{directive.text}</span>
                        {directive.sourceClaimId && (
                          <span className="s2s-writer-claim">
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

      <section className="s2s-panel">
        <div className="s2s-panel-head">
          <h3 className="s2s-panel-title">{t("preview.tracesTitle")}</h3>
        </div>
        {traces.length === 0 ? (
          <p className="s2s-empty">{t("preview.noTraces")}</p>
        ) : (
          <VirtualList
            ariaLabel={t("preview.tracesTitle")}
            itemHeight={traceItemHeight}
            overscan={3}
            viewportHeight="none"
            items={traces}
            renderItem={(trace, idx) => {
              const summary = extractTraceSummary(trace);
              return (
                <details
                  key={`trace-${idx}`}
                  className="s2s-tile s2s-disclosure"
                >
                  <summary>
                    <span className="s2s-tag-row">
                      <span
                        className={`s2s-badge s2s-badge-sm ${
                          stageBadge[summary.stage] ?? "s2s-badge-muted"
                        }`}
                      >
                        {tEnum("stage", summary.stage)}
                      </span>
                      <span className="s2s-trace-model">{summary.model}</span>
                    </span>
                    <span className="s2s-chip s2s-chip-muted">
                      {summary.usage.totalTokens} {t("preview.tokens")}
                      {summary.latencyMs ? ` · ${summary.latencyMs}ms` : ""}
                    </span>
                  </summary>

                  <div className="s2s-kv-grid">
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
                    <RawJsonDrawer value={trace} testId="raw-trace" />
                  </div>
                </details>
              );
            }}
          />
        )}
      </section>
    </div>
  );
}

// Collapsed trace card ≈ padding + summary line. Used only as the virtualizer's
// estimate; expanded cards overflow their slot gracefully.
const traceItemHeight = 56;
