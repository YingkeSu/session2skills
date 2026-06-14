import type { LLMTraceSummary } from "../runs.js";

type PreviewTracesTabProps = {
  skillMarkdown: string | null;
  traces: Array<Record<string, unknown>>;
};

const stageColors: Record<string, string> = {
  analyst: "#0d6efd",
  skeptic: "#d63384",
  writer: "#6610f2",
  verifier: "#198754",
};

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
    promptTokens: usageSource?.prompt_tokens ?? 0,
    completionTokens: usageSource?.completion_tokens ?? 0,
    totalTokens: usageSource?.total_tokens ?? 0,
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

function renderMarkdown(md: string): JSX.Element {
  const lines = md.split("\n");
  const elements: JSX.Element[] = [];
  let inList = false;
  let listItems: string[] = [];
  let listKey = 0;

  function flushList(): JSX.Element | null {
    if (!inList || listItems.length === 0) return null;
    inList = false;
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
            dangerouslySetInnerHTML={{ __html: item }}
          />
        ))}
      </ul>
    );
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);

    const listEnd = flushList();
    if (listEnd) elements.push(listEnd);

    if (headingMatch) {
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
          dangerouslySetInnerHTML={{ __html: text }}
        />
      );
      continue;
    }

    if (listMatch) {
      inList = true;
      listItems.push(listMatch[1]);
      continue;
    }

    if (line.trim() === "") {
      continue;
    }

    elements.push(
      <p
        key={`p-${elements.length}`}
        style={{
          margin: "0 0 8px",
          lineHeight: 1.6,
          color: "#212529",
        }}
        dangerouslySetInnerHTML={{ __html: line }}
      />
    );
  }

  const trailingList = flushList();
  if (trailingList) elements.push(trailingList);

  return <>{elements}</>;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export function PreviewTracesTab({
  skillMarkdown,
  traces,
}: PreviewTracesTabProps): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <section
        style={{
          border: "1px solid #dee2e6",
          borderRadius: "6px",
          padding: "16px",
        }}
      >
        <h3 style={{ margin: "0 0 12px" }}>SKILL.md Preview</h3>
        {skillMarkdown == null ? (
          <p style={{ color: "#666" }}>No SKILL.md available for this run.</p>
        ) : (
          <div
            style={{
              border: "1px solid #e9ecef",
              borderRadius: "4px",
              padding: "14px",
              background: "#fff",
              lineHeight: 1.6,
            }}
          >
            {renderMarkdown(skillMarkdown)}
          </div>
        )}
      </section>

      <section
        style={{
          border: "1px solid #dee2e6",
          borderRadius: "6px",
          padding: "16px",
        }}
      >
        <h3 style={{ margin: "0 0 12px" }}>LLM Traces</h3>
        {traces.length === 0 ? (
          <p style={{ color: "#666" }}>No LLM traces recorded.</p>
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
                  style={{
                    border: "1px solid #e9ecef",
                    borderRadius: "4px",
                    padding: "10px",
                    background: "#fff",
                  }}
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
                          color: "#fff",
                          background:
                            stageColors[summary.stage] ?? "#6c757d",
                        }}
                      >
                        {summary.stage}
                      </span>
                      <span style={{ fontSize: "13px", fontWeight: 500 }}>
                        {summary.model}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#666",
                      }}
                    >
                      {formatBytes(summary.usage.totalTokens)} tokens
                      {summary.latencyMs
                        ? ` · ${summary.latencyMs}ms`
                        : ""}
                    </span>
                  </summary>

                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "13px",
                      color: "#495057",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "6px",
                    }}
                  >
                    <div>
                      <strong>Provider:</strong> {summary.provider}
                    </div>
                    <div>
                      <strong>Prompt tokens:</strong>{" "}
                      {summary.usage.promptTokens}
                    </div>
                    <div>
                      <strong>Completion tokens:</strong>{" "}
                      {summary.usage.completionTokens}
                    </div>
                    <div>
                      <strong>Total tokens:</strong>{" "}
                      {summary.usage.totalTokens}
                    </div>
                    {summary.latencyMs != null && (
                      <div>
                        <strong>Latency:</strong> {summary.latencyMs}ms
                      </div>
                    )}
                    {summary.finishReason && (
                      <div>
                        <strong>Finish reason:</strong>{" "}
                        {summary.finishReason}
                      </div>
                    )}
                    {(summary.promptName || summary.requestPromptName) && (
                      <div>
                        <strong>Prompt:</strong>{" "}
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
