import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildSelectedRunUrl,
  resolveSelectedRunFromLocation,
  RunsDashboard,
} from "./App.js";
import { LocaleProvider } from "./i18n/LocaleContext.js";
import type { RunSummary } from "./runs.js";

const runs: RunSummary[] = [
  {
    name: "writer-pass",
    model: "gpt-5",
    generatedAt: "2026-05-20T10:00:00Z",
    verifierPassed: true,
    claimCount: 12,
    skepticScore: 0.92,
    skepticIssueCount: 1,
  },
  {
    name: "skeptic-needs-review",
    model: "gpt-5-mini",
    generatedAt: "2026-05-21T10:00:00Z",
    verifierPassed: false,
    claimCount: 8,
    skepticScore: 0.58,
    skepticIssueCount: 3,
  },
];

describe("RunsDashboard", () => {
  it("renders compact summary metrics derived from the run list", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <RunsDashboard runs={runs} onSelect={() => undefined} />
      </LocaleProvider>,
    );

    expect(html).toContain("2");
    expect(html).toContain("1");
    expect(html).toContain("4");
    expect(html).toContain("0.75");
    expect(html).toContain("skeptic-needs-review");
  });
});

describe("run URL state", () => {
  it("reads the selected run from either query or hash URL state", () => {
    expect(
      resolveSelectedRunFromLocation(
        new URL("https://example.test/?run=skeptic-needs-review"),
      ),
    ).toBe("skeptic-needs-review");

    expect(
      resolveSelectedRunFromLocation(
        new URL("https://example.test/#run=writer-pass"),
      ),
    ).toBe("writer-pass");
  });

  it("writes the selected run into the query string and removes it when returning to the list", () => {
    expect(
      buildSelectedRunUrl(
        {
          pathname: "/runs",
          search: "?page=2",
        },
        "skeptic-needs-review",
      ),
    ).toBe("/runs?page=2&run=skeptic-needs-review");

    expect(
      buildSelectedRunUrl(
        {
          pathname: "/runs",
          search: "?page=2&run=skeptic-needs-review",
        },
        null,
      ),
    ).toBe("/runs?page=2");
  });
});
