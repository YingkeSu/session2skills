## Issues & Gotchas
(none yet)

## 2026-04-11 Timeout Fixes Applied
- All beforeAll hooks need explicit vitest timeouts (default 10000ms is too short for CLI preflight)
- Hybrid LLM tests need spawnSync timeout of 300000ms (5 min) — 120000ms (2 min) was insufficient
- beforeAll for hybrid tests need vitest timeout of 300000ms to match spawnSync

## 2026-04-11 Known Test Isolation Issues (single-fork mode)
- --force tests sometimes fail when run after other tests in same fork (state pollution)
- LLM non-determinism: llm-session-claims and merged-claims may be empty arrays
- generate --profile from v1 profile may fail after hybrid analyze runs (port/state conflict)
- These are environmental issues, not code bugs — tests pass when run individually

## 2026-04-11 generate --profile v2 test
- skillRenderer output check: CLI outputs JSON but may also output summary text. The `toContain('"skillRenderer": "llm"')` check should use regex on the JSON portion only
