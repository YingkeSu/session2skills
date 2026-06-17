# Web UI Optimization Issues

No dedicated tracked web UI PRD exists in this repository. The current tracked product contract is the `serve` command plus the `feat/web-rebuild` branch UI surface. The original MVP planning docs explicitly scoped UI out, so this file records the local `/to-issue` breakdown used for the web optimization pass.

## Completed Slices

### 1. Runs dashboard with scan-friendly status

- First screen remains the runs list.
- Summary metrics are derived from loaded runs.
- Run rows distinguish verifier status, skeptic score, and issue counts.
- Focused test: `web/src/App.test.tsx`.

### 2. Run detail shell and navigation

- Detail shell is shared across loading, error, and ready states.
- Ready header exposes run identity and report status.
- Tabs expose stable accessible metadata.
- Focused test: `web/src/components/RunDetailPage.test.tsx`.

### 3. Audit, reports, preview, and evidence panels

- Audit claims are grouped with clearer counts and missing-evidence display.
- Reports panels use denser status/severity presentation.
- Preview/traces panels improve narrow-screen readability.
- Evidence panel keeps lazy loading and now has DOM interaction coverage.
- Focused tests:
  - `web/src/components/AuditViewTab.test.tsx`
  - `web/src/components/EvidencePanel.test.tsx`
  - `web/src/components/ReportsTab.test.tsx`
  - `web/src/components/PreviewTracesTab.test.tsx`

### 4. Browser UI flow e2e coverage

- `tests/e2e/fixture-run.ts` seeds list, detail, audit, reports, preview, traces, writer output, and evidence expansion artifacts for web e2e.
- `tests/e2e/web-flow.test.ts` starts the real `serve` command, opens the served SPA in Playwright Chromium, selects a run, verifies `?run=`, switches Audit/Reports/Preview tabs, toggles language, returns to the list, and expands an evidence panel.
- The browser test includes desktop and mobile viewport smoke checks.
- Focused command: `npm run verify:web`.

### 5. Pipeline and design cleanup

The open web UI design decisions are closed with these outcomes:

- `writerSections` remains in the browser detail payload and is rendered in Preview as structured Writer Output. The UI extracts section title, summary, directives, source claim IDs, and grounding claim IDs from the writer payload so users can inspect the Writer's structured plan beside the rendered `SKILL.md`.
- Selected run state is represented in URL query state as `?run=<name>`. The dashboard also accepts `#run=<name>` and `#?run=<name>` as incoming-link fallbacks, but new navigation writes the canonical query parameter. Returning to the runs list removes only `run` and preserves unrelated query parameters.
- Markdown preview intentionally supports a safe limited subset instead of a complete Markdown/HTML renderer. It renders headings, bullet lists, paragraphs, and fenced code blocks through React text nodes; unsupported inline Markdown and HTML remain literal text. Long previews are capped at 500 lines, and code blocks are capped at 120 lines, with visible truncation notices.
- The `jsdom` dev dependency is justified by DOM-level panel coverage that server-side rendering cannot exercise. Current `jsdom` tests cover Preview Writer Output, literal rendering of unsupported HTML, preview truncation, tab/report panels, and lazy evidence expansion/fetch behavior.
- The `playwright` dev dependency is justified by real browser coverage of the built SPA served through the production `serve` command. `scripts/ensure-playwright-browser.mjs` keeps Chromium availability explicit for `verify:web`.

## Web Pipeline Preconditions

Manual `serve` runs and browser e2e checks both require the same build artifacts and fixture shape:

- Build backend CLI first so `dist/cli/main.js` exists.
- Build web assets first so `web/dist/index.html` and `/assets/` exist.
- Serve a project directory that already has `generated-skills/<run-name>/` populated with the generated run artifacts.

For focused verification, run `npm run verify:web`. It builds backend and web assets, ensures Playwright Chromium is available, seeds a temporary `generated-skills/alpha-run`, starts the real `serve` command, checks server health and API/static assets, and drives the optimized SPA in a browser through the list-detail-tab-evidence flow.

## Follow-Up Issues

None currently tracked for the web UI optimization pass.
