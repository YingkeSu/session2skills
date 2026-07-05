# UI Redesign Brief: Desktop Agent Run Cockpit

Build one complete front-end redesign for unified review. The work is
internally split across Codex/Claude workers, but the user should receive one
integrated UI for final acceptance.

## Product Goal

Upgrade the current Web UI from a simple test-style dashboard into a desktop
agent run cockpit for inspecting generated skill runs, judging quality, and
starting new runs.

The backend stays unchanged. The redesign should make existing run artifacts
feel trustworthy, navigable, and application-like.

## Platform

- Desktop first.
- Future Electron app compatibility matters.
- No mobile product scope.
- Primary viewport: `1280x800`.
- QA viewport: `1440x900`.
- Minimum usable width: `1024px` without text overlap or broken layout.

## Technical Boundaries

- Keep React + Vite + TypeScript.
- Do not modify backend API contracts.
- Do not add a large UI framework such as MUI, Ant Design, shadcn, or Tailwind.
- A small icon dependency such as `lucide-react` is acceptable if justified.
- Avoid external CDNs, remote fonts, and runtime external assets.
- Keep assets packageable for Electron.
- Preserve i18n behavior; update Chinese and English messages together.
- Keep `?run=<name>` compatibility, but organize UI state so it can later work
  with Electron settings or IPC.

## Design Direction

Use a desktop master-detail cockpit:

```text
Top bar: project / health / docs / language / new run
Left rail: runs, filters, quality status
Main workspace: overview, reports, preview, traces
Inspector: evidence, claim context, selected details
```

The UI should feel like a focused developer/agent operations app, not a
marketing site and not a generic admin template.

## Required Experience Changes

- Replace the current stacked metric cards, large generation form, and full
  table-first page with an application shell.
- Make one run selected by default when runs exist.
- Make the default run view an Overview that answers:
  - Did verifier pass?
  - What is the skeptic score?
  - How many claims and issues exist?
  - What should the user inspect next?
- Keep Reports, Preview, Traces, Claims, and Evidence available without making
  raw evidence IDs dominate the first screen.
- Move Generate into a command panel, drawer, or dedicated workflow pane.
- Preserve existing generate functionality and advanced controls.
- Keep dense desktop data review possible; a high-quality desktop table is
  acceptable.
- Improve visual system consistency: buttons, tabs, badges, cards, forms,
  status colors, spacing, and typography.
- Reduce scattered inline styles where practical.

## Figma Role

Figma is a design blueprint and optional asset source, not a blocking final
deliverable. If Figma tooling is available, Codex may create desktop views for:

- Cockpit / Runs Workspace.
- Run Overview + Inspector.
- New Run Panel.

Final acceptance is based on the running local UI.

## Suggested Worker Slices

- Slice A: Shell + Generate.
- Slice B: Dashboard + Run List.
- Slice C: Run Detail Workspace.
- Slice D: Evidence + Visual System.
- Slice E: Fresh-context Integration Review.

## Acceptance Gates

- At `1280x800`, the first screen clearly reads as an agent run cockpit.
- At `1440x900`, dense review workflows use space well.
- At `1024px` width, layout remains usable with no incoherent overlap.
- Existing generated-skills data loads without backend changes.
- User can review runs, inspect one run's quality, switch reports/preview/traces,
  inspect evidence, return to the run set, and start a new run.
- i18n remains functional.
- No remote-only assets or fonts are required.
- Verification target:

```bash
npm run typecheck:web
npm run typecheck:electron
npm run test:unit
npm run verify:web
```

If `verify:web` or Electron smoke testing is blocked by environment state, Codex
must report the blocker and still run the strongest available focused checks.

