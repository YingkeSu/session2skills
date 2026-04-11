## Learnings
(none yet)

- Legacy `analyze` E2E coverage can need an analyze-specific preflight probe: `inspect` may list recent sessions while `analyze` still reports no analyzable sessions, so the suite should log and short-circuit cleanly when artifacts cannot be produced in the current environment.

- `inspect` E2E coverage can stay format-focused: assert the tab-separated header row and line counts instead of parsing session content.
- For the invalid-directory failure path, passing a known file path (for example `package.json`) is reliable; a nonexistent path currently behaves like an empty session listing.
- `generate --profile` E2E coverage should do analyze-specific preflight setup in `beforeAll`: `inspect` can succeed while `analyze` still yields no analyzable sessions, so the suite should prepare legacy/hybrid profile artifacts up front and log/short-circuit cleanly when those artifacts cannot be produced.

- Error-scenario E2E coverage currently needs compatibility guards for real CLI behavior: `analyze -d /nonexistent/...` returns success with `No OpenCode sessions found...`, and `inspect --recent 0` exits early with the shared positive-integer validation error.
- For `generate --profile ... --hybrid` coverage, a legacy-style `v1_profile.json` may need to be derived from analyze output in-test because the current built CLI can emit `profile/v2` even on non-hybrid `analyze` runs.
