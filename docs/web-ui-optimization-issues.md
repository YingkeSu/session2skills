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

## Web Pipeline Preconditions

Manual `serve` runs and browser e2e checks both require the same build artifacts and fixture shape:

- Build backend CLI first so `dist/cli/main.js` exists.
- Build web assets first so `web/dist/index.html` and `/assets/` exist.
- Serve a project directory that already has `generated-skills/<run-name>/` populated with the generated run artifacts.

For focused verification, run `npm run verify:web`. It builds backend and web assets, seeds a temporary `generated-skills/alpha-run`, starts the real `serve` command, and checks server health, `/api/runs`, SPA shell serving, and bundled asset serving.
The current script contract is intentionally broader than the existing single-file server check: `verify:web` should execute the web e2e suite, including any future browser-driven files named `tests/e2e/web-*.test.ts`.

## Follow-Up Issues

### 4. Browser UI flow e2e coverage

The current e2e suite verifies server health, `/api/runs`, SPA shell serving, and asset serving. It still does not drive the browser through the optimized UI.

Acceptance criteria:
- Add a browser-driven check that opens the served SPA, selects a run, switches all three tabs, toggles language, goes back to the list, and expands one evidence panel.
- Include enough fixture artifacts for list, detail, audit, reports, preview, traces, and evidence expansion.
- Run after both backend and web assets are built.
- Include desktop and mobile viewport smoke checks.
- Implement this as a `tests/e2e/web-*.test.ts` file so `npm run verify:web` picks it up automatically.

### 5. Pipeline and design cleanup

Acceptance criteria:
- Decide whether `writerSections` should be rendered in the UI or removed from the browser payload.
- Decide whether selected run state should be reflected in URL/query state for refresh and back-button behavior.
- Document the intentionally limited markdown preview renderer or replace it with a safer complete renderer.
- Track the cost of the new `jsdom` dev dependency against the value of DOM-level component coverage.
