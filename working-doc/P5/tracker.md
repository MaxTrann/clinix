# P5 — Tracker

Overall: done locally; waiting for user PR workflow  
Updated: 2026-10-27

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Implement helpers and API TZ config | P3 DB timezone | done | `nowVN`, `todayVN`, `weekdayVN`; `TZ` validated and applied during API bootstrap | 2026-10-27 |
| T2 | Add boundary checks | T1 | done | Unit covers VN midnight and ISO weekday; MySQL integration checks `NOW()`/`WEEKDAY()` on a `+07:00` session at both boundaries, 2/2 pass | 2026-10-27 |
| T3 | Review, verify, and record | T1, T2 | done | API lint/build, focused unit 35/35, targeted MySQL integration 2/2, Prettier and diff checks pass; records updated | 2026-10-27 |

## Notes

- Issue #49 body was unavailable in the current environment; implementation followed checked-in Admin PLAN Q43/P5 and cases BS-37/SE-A14.
- The integration test harness recreated only the guarded local `clinix_test` database; no Dev/Prod database was used.

## Verification log

| Command/check | Result | Date |
|---|---|---|
| `git status --short --branch` in `clinix` | Clean working tree on `main` before changes | 2026-10-27 |
| `npm.cmd exec -- prettier --write ...` (P5 TypeScript files) | Pass | 2026-10-27 |
| `npm.cmd run test -- src/common/time/time.spec.ts src/config/env.validation.spec.ts` | Pass: 2 files, 35/35 tests | 2026-10-27 |
| `npm.cmd run lint` (API) | Pass | 2026-10-27 |
| `npm.cmd run build` (API) | Pass | 2026-10-27 |
| `docker compose ps --format json` | Docker DB service healthy; test harness restricted to `clinix_test` | 2026-10-27 |
| `npm.cmd run test:int -- src/common/time/time-zone.int-spec.ts` (first run) | 2/2 failed because mysql2 returned arithmetic `WEEKDAY()` as a string; assertion now converts its value explicitly | 2026-10-27 |
| `npm.cmd run test:int -- src/common/time/time-zone.int-spec.ts` (rerun) | Pass: 1 file, 2/2 tests at 23:59:59 and 00:00 VN | 2026-10-27 |
| `npm.cmd exec -- prettier --check ...` | Pass for P5 TypeScript files | 2026-10-27 |
| `git diff --check` | Pass after final changes | 2026-10-27 |
