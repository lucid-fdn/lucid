# Agent Ops Production Runbook

This runbook covers the current production shape for Agent Ops, Browser Operator, channel-native launch, and Mission Control verification.

## Current Production Shape

Lucid production currently runs the control plane and split workers on Railway:

- `Lucid`: web/control-plane service, `WORKER_MODE=web`, Next.js served through the shared Railway entrypoint.
- `lucid-channels`: channel gateways and low-latency channel traffic.
- `lucid-automation`: scheduled tasks and background automation.
- `lucid-browser`: isolated Browser Operator gateway.
- `lucid-byo-runtime-smoke`: long-lived BYO runtime canary. It runs the tiny `ops/runtime-byo-smoke` package and sends authenticated `lucid-runtime-v2` heartbeats every 30 seconds without claiming user work.
- `Redis`: queue/cache/backlog infrastructure.

The code still supports Vercel for the web/control-plane target, but current Railway production expects the `Lucid` service to answer web health checks directly.

## Health Checks

The web/control-plane service must expose unauthenticated health checks:

```bash
curl -fsS https://<app-host>/ready
curl -fsS https://<app-host>/api/health
```

`/ready` must return JSON and must not redirect to login. Keep this route outside auth middleware because Railway uses it to decide whether the service is healthy.

The Browser Operator gateway should also expose a ready endpoint:

```bash
curl -fsS https://<browser-gateway-host>/ready
```

## BYO Runtime Canary

Production includes a permanent Railway BYO smoke service:

```text
lucid-byo-runtime-smoke
```

Purpose:

- prove the real dedicated/BYO runtime deploy shape, not only a one-shot protocol script.
- continuously exercise `/api/runtimes/heartbeat` with runtime API-key auth.
- report runtime service and adapter-probe metadata into Mission Control.
- stay isolated from user work; it is a canary only.

Expected production DB state:

- `dedicated_runtimes.display_name = lucid-byo-runtime-smoke-prod`
- `runtime_tier = byo`
- `runtime_flavor = c2a_autonomous`
- `runtime_protocol = lucid-runtime-v2`
- `provider = manual`
- `status = connected`
- `heartbeat_counter` increases roughly every 30 seconds.
- `runtime_services` contains one `railway-byo-runtime-smoke` service.
- `adapter_probe_result.status = pass`.

If the service goes unhealthy:

- check Railway service logs for `[byo-smoke] heartbeat connected ok`.
- verify `LUCID_RUNTIME_ID`, `LUCID_RUNTIME_KEY`, `LUCID_RUNTIME_GENERATION`, and `LUCID_CONTROL_PLANE_URL` are set on `lucid-byo-runtime-smoke`.
- confirm the runtime row has not been revoked and the generation matches.
- do not assign customer agents to this canary runtime.

## Browser Operator Smoke

Run this after changing Browser Operator code, provider envs, artifact storage, or Railway split-service config:

```bash
BROWSER_QA_CONTROL_URL=https://<browser-gateway-host> \
npm run agent-ops:browser-provider-smoke -- --run-session --target https://www.lucid.foundation
```

Expected result:

- gateway status is healthy.
- provider is normally `playwright` in Lucid-owned mode.
- a browser session starts and completes.
- screenshot/evidence artifacts are written.
- the command exits successfully without provider, quota, private-network, or artifact errors.

Use `--require-live` only when the configured target environment and provider credentials are intentionally live.

## Channel Launch Smoke

For the common page-check canary, launch the same workflow from each released channel:

| Channel | Command |
|---|---|
| Slack | `/lucid check https://www.lucid.foundation` |
| Telegram | `/check https://www.lucid.foundation` |
| Discord | `/ops workflow:check-page target:https://www.lucid.foundation` |

Expected result:

- exactly one Agent Ops run is created.
- workflow is `check-page`.
- `metadata.team_ops.channelLaunchStatus.<channel>` records launch and report status.
- Mission Control run detail shows dispatch tier, runtime compatibility, Browser Operator evidence, artifacts, findings, and channel report state.
- channel copy is clear and does not expose internal provider details.

WhatsApp, Teams, and iMessage follow the same `check <url>` shape when released for the target environment. Do not mark those channels as production-smoked until provider bindings, tokens/webhooks, commands, and Mission Control channel status have been verified.

## Mission Control Browser Smoke

The Browser Operator cockpit lives at:

```text
/<workspace>/mission-control/browser
```

With an authenticated production session, verify:

- account list and account readiness cards load.
- `Test account` writes a health snapshot.
- secure takeover creates a connection session.
- takeover completion refreshes account health.
- reconnect/expiry/MFA/CAPTCHA/provider alerts dedupe and resolve correctly.
- provider health and browser capacity panels render without leaking secrets.

If the browser reaches the login screen, the route is live but the UI smoke is not complete. Finish with a real authenticated production session before claiming full UI verification.

## Log Watch

After deploy or live smoke, watch logs for 15 to 30 minutes.

Check:

- duplicate Agent Ops runs.
- Slack/Telegram/Discord auth or timeout failures.
- Browser Operator provider failures.
- artifact write failures.
- quota/lease wait failures.
- DB/RLS errors.
- entitlement fallback warnings.
- alert spam or repeated unresolved account-health alerts.

Benign noise currently includes the `bigint` pure-JS fallback warning when no native binding is available.

## Provider Policy

Production defaults to Lucid-owned Playwright capacity inside the isolated `lucid-browser` gateway.

Hosted providers and BYO CDP are optional:

- Browserbase, Steel, Browserless, Stagehand, Browser Use, and remote CDP are adapters, not the default business model.
- Authenticated account sessions and checkout are provider/profile pinned and must fail closed instead of silently falling back.
- Read-only public tasks may use fallback only when premium fallback is explicitly enabled by policy.
- Provider credentials can be stored through centralized Nango refs, but Nango handles auth/token refresh only. Browser execution, profile affinity, evidence, policy, receipts, and routing remain Lucid-owned.

## Current Verified Production Snapshot

Latest verified shape, 2026-05-17:

- Railway services `Lucid`, `lucid-channels`, `lucid-automation`, `lucid-browser`, `lucid-byo-runtime-smoke`, and `Redis` were deployed and healthy.
- `Lucid` served `/ready` as `200` JSON and `/api/health` as healthy.
- `lucid-browser` served `/ready` as healthy.
- Browser Operator live smoke completed against `https://www.lucid.foundation` with screenshot/evidence artifacts.
- Slack channel-launch API smoke created completed `check-page` runs with Browser Operator artifacts and `metadata.team_ops.channelLaunchStatus.slack`.
- BYO runtime canary `lucid-byo-runtime-smoke-prod` connected through production `/api/runtimes/heartbeat`, reported runtime service metadata, and adapter probe status `pass`.
- A 15-minute Railway log watch showed no duplicate runs, auth failures, entitlement fallback, RLS errors, Browser Operator provider failures, or alert spam.

Remaining manual boundary:

- production `/mission-control/browser` UI click-through requires an authenticated production session.
- real human Slack, Telegram, and Discord client smoke should be run from the actual clients when validating visible channel UX, not only API-level launch.
