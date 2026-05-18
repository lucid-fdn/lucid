# Test Matrix

This repo uses layered gates instead of one slow, opaque test command. Keep domain tests close to their code, then expose repeatable package scripts for CI, release, and local validation.

## Canonical Commands

| Command | Scope | Use when |
| --- | --- | --- |
| `npm run typecheck` | TypeScript contracts | Any code change before handoff |
| `npm run check:pr` | Fast PR gate: typecheck, stack boundaries, runtime safety, work graph, builder answers, retrieval, memory moat, hosted channels | Most application PRs before review |
| `npm run check:knowledge` | Knowledge/Brain gate: retrieval evals, memory moat, Brain intake acceptance, production-hardening unit coverage | Brain, Knowledge, memory, retrieval, source, or prompt-packet changes |
| `npm run check:beta:local` | Broad local beta gate: `check:pr`, `check:knowledge`, Agent Ops quality gates, Playwright smoke | Before tagging or promoting a local beta candidate |
| `npm run check:beta:staging` | Staging Knowledge/Brain acceptance against a deployed app | Before promoting a staging candidate after auth state is prepared |
| `npm run test:inventory` | Machine-readable inventory of package scripts, loose test-like scripts, references, and cleanup candidates | Before deleting or renaming test scripts |

## Domain Gates

| Area | Command |
| --- | --- |
| Browser E2E smoke | `npm run test:e2e:smoke` |
| App HTTP smoke | `npm run test:app-smoke` |
| Builder deterministic answers | `npm run test:builder:answers` |
| Builder live stress | `npm run test:builder:stress-live` |
| Hosted channels | `npm run test:channels:smoke` |
| Worker channel smoke | `npm run test:channels:smoke:full` |
| Agent Ops quality | `npm run agent-ops:quality-gates` |
| Agent Ops production preflight | `npm run agent-ops:prod-preflight` |
| Runtime capability drift | `npm run runtime:capability-drift` |
| Runtime operator safety | `npm run runtime:operator-safety` |
| Work Graph production hardening | `npm run work-graph:production-hardening` |
| Brain intake acceptance | `npm run knowledge:brain-intake:check` |
| Knowledge production hardening | `npm run knowledge:production-hardening:check` |

## Browser E2E Harness

Use the dev-server path for quick UI iteration, but use the built preview harness for full-suite confidence:

```bash
npm run build
VERCEL_ENV=preview E2E_DISABLE_AI_GENERATION_RATE_LIMITS=true npm start
E2E_REUSE_AUTH_STATE=true npm run test:e2e:smoke
```

Why:
- `next dev` can produce false negatives from cold route compilation and stale development chunks.
- `next start` exercises production-built routes, middleware, and server rendering.
- `VERCEL_ENV=preview` enables signed E2E auth without opening a production bypass.
- `E2E_DISABLE_AI_GENERATION_RATE_LIMITS=true` is only honored in Vercel preview mode, so repeated local/preview browser runs do not exhaust hourly AI generation quota while real production remains rate-limited.

## Auth State Convention

Browser acceptance scripts should use one of these storage-state paths:

| Environment | Path | Notes |
| --- | --- | --- |
| Local | `.playwright/auth/user.json` | Default for local authenticated acceptance scripts |
| Staging/Vercel | `.playwright/auth/staging-vercel.json` | Create with `node scripts/create-staging-auth-state.mjs` |

Every script that needs auth should accept `E2E_AUTH_STATE`. Scripts that hit a running app should accept `SMOKE_BASE_URL` or `PLAYWRIGHT_BASE_URL`. Do not hardcode a workspace slug or a personal account in tests; create temporary fixtures and clean them up.

## Manual Diagnostics

These are intentionally not canonical gates. They remain available for incident/debug work and should not be added to PR CI without first converting them into deterministic fixtures.

| Diagnostic | Decision |
| --- | --- |
| `scripts/db-check.js` | Keep manual DB/passport schema inspection via `DATABASE_URL` / `RAILWAY_DATABASE_URL`. |
| `scripts/stress-test-crypto-plans.ts` | Keep manual NOWPayments plan correctness stress; requires explicit env/test org fixtures. |
| `scripts/stress-test-crypto-webhooks.ts` | Keep manual NOWPayments webhook stress; requires running app and explicit env/test org fixtures. |
| `scripts/test-session-signer-browser.js` | Keep manual browser-console session signer diagnostic. |
| `scripts/test-llama-passport.ts` | Keep manual Lucid-L2 passport/chat diagnostic while L2 compatibility work is active. |
| `tests/gateway/*` | Keep manual gateway/LiteLLM diagnostics. Promote only if a stable gateway fixture is introduced. |
| `tests/trading/trading-stress-test.js` | Keep manual trading stress; requires live Supabase/payment fixtures. |
| `tests/trading/trading-system-test.js` | Keep manual/system trading test documented by trading migration notes. |

Removed as dead code: `scripts/check-passport-tables.js` used a hardcoded legacy path and was superseded by `scripts/db-check.js`.

## Placement Rules

- Put pure unit/integration tests beside the domain code in `src/**/__tests__`.
- Put browser specs in `tests/e2e`.
- Put cross-service acceptance runners in `scripts/*-acceptance.mjs`.
- Put HTTP smoke tests in `tests/smoke`.
- Keep new package scripts compositional. Do not duplicate long test file lists if an existing domain command already covers them.
- Do not delete old-looking scripts without running `npm run test:inventory` and checking generated reference evidence in `docs/generated/test-inventory.json`.

## Promotion Rule

A beta candidate is not considered green until:

1. `npm run check:pr` passes.
2. The affected domain gate passes, for example `npm run check:knowledge`.
3. Browser smoke passes with the expected auth mode.
4. Staging acceptance passes for any feature that depends on deployed auth, storage, runtime, or provider infrastructure.
