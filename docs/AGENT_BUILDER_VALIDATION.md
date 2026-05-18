# Agent Builder Validation

Last updated: 2026-05-07

## Scope

This document records the current validation state for the agent builder flow, including the headless reusable flow controller, topology decision layer, guided chat steps, skills, schedules, channels, engine selection, grouped app connections, template hydration, lifecycle canvas node, team structure editing, and worker/runtime handoff assumptions.

## Passing Gates

- Root typecheck: `npm run typecheck`
- Worker typecheck: `cd worker; npm run typecheck`
- Full app test suite: `npm test`
- Full worker test suite: `cd worker; npm test`
- DB quick stress: `31/31` tests passing
- Telegram worker subset: `15/15` tests passing
- Local HTTP smoke on port `3000`: passing after a clean dev server restart
- Focused browser builder topology smoke: `5/5` Chromium tests passing with local auth
- Live builder stress matrix: `324/324` passing with generation p50 `6ms`, p95 `13ms`, max `38ms`
- Full browser E2E smoke suite: `npm run test:e2e:smoke`
- App smoke suite: `npm run test:app-smoke`
- Production build: `npm run build:isolated`

## Focused Builder Coverage

The focused builder regression suite covers:

- Prompt to draft/name generation behavior
- Builder chat turn routing
- Template shortlist selection
- Topology policy and final mode enforcement
- Agent vs team vs clarification routing
- Draft generation and mutation
- Builder planning-agent path
- Template-required input handling
- Team member role, mission, responsibilities, tools, and prompt synthesis
- Headless builder flow state transitions
- Shared start/chat-review/connect/deploy/done step behavior
- Schedule/task defaults
- Internal channel filtering behavior
- Message-attached capability buttons
- Grouped connect/setup flow
- Per-agent app connection mapping
- Stable canvas lifecycle node behavior for draft, building, deploying, created, and failed states
- Right-panel hydration and project shell navigation

Focused command:

```bash
npm test -- src/lib/ai/project-generation/generate-blueprint.topology.test.ts src/lib/agent-builder/topology/topology-policy.test.ts src/lib/ai/project-generation/chat.test.ts
```

Focused browser command:

```bash
npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/builder-topology.smoke.spec.ts --project=chromium
```

Live builder stress command:

```bash
npm run test:builder:stress-live -- --limit=999 --concurrency=3
```

## Builder Performance Contract

Initial agent/team creation uses a deterministic-first server path. The first builder result must not depend on sequential LLM calls for intent extraction, planning, topology, and draft generation. The server should return a useful editable draft from profile detection, template shortlist, topology policy, capability registry, and deterministic planning.

The model-first path is still available for controlled experiments or deeper generation by setting:

```bash
LUCID_BUILDER_LLM_FIRST_PASS=true
```

Default production behavior should keep `LUCID_BUILDER_LLM_FIRST_PASS` unset or false.

Current measured evidence from the live stress harness:

- Total cases: `324`
- Generation cases: `260`
- Routing/question cases: `64`
- Passed: `324/324`
- Generation/routing combined latency: p50 `6ms`, p90 `11ms`, p95 `13ms`, max `38ms`

Performance SLOs:

- Builder generation function p95: `<100ms`
- API route perceived first draft: `<2s`, including auth, access, template fetch, stream setup, and browser rendering
- Question/routing turns: deterministic local handling when possible, with no draft mutation for product/status questions
- LLM refinement: allowed only after the deterministic draft exists, or when the user explicitly asks for deeper refinement

Architecture rules:

- Initial creation should call `deriveGenerationIntent`, deterministic planning, and topology policy before considering any model call.
- `runBuilderPlanningAgent` must support deterministic-only planning for initial creation.
- Topology clarification must be policy-first for broad multi-domain prompts.
- High-confidence official templates can be selected during the deterministic pass when the template kind matches the topology.
- The live stress report is a regression gate for both answer quality and latency; do not loosen expectations just to hide a product regression.

## E2E Harness

Browser E2E runs with local auth and an explicit deterministic chat response for assistant chat smoke coverage. The mock is guarded by all of the following conditions:

- `AUTH_PROVIDER=local`
- request header `x-lucid-e2e-mock-chat: 1`
- `CI !== "true"`

The route still performs auth, rate limiting, assistant lookup, membership checks, entitlement checks, usage increment, conversation creation, and message extraction before returning the deterministic stream. This keeps local E2E independent from external model gateway availability while preserving the route contract.

## Builder Architecture Notes

- `useAgentBuilderFlow` and `AgentBuilderFlowProvider` are the shared state contract for builder shells.
- `/new`, the agents canvas overlay, and mobile modal entry points should compose shared builder steps rather than duplicating prompt, chat, connection, deploy, or done logic.
- Canvas creation uses one lifecycle node that morphs from draft to deploying to created/failed, preserving node position and avoiding duplicate loading nodes.
- App selection is capability-first; OAuth/app authorization is grouped into the connect step and mapped to per-agent connection bindings when available.
- Topology selection is centralized under `src/lib/agent-builder/topology`; UI affordances should not fork separate agent/team decision logic.
- Project blueprint generation returns `topology_decision` and enforces the selected mode before returning the draft.
- Existing agent pages should continue reusing shared config panels and modals where applicable, but the creation flow owns deploy sequencing.

## Local Runtime Notes

- Canonical local worker command: `cd worker && npm run start:local`
- `start:local` uses the compiled worker path and loads root/worker env files deterministically.
- Optional template plugin installation can warn when a template plugin is unavailable in the local catalog; activation failures remain fatal and roll back the assistant.

## Production Readiness Rule

Do not mark the agent builder as production-ready until all of the following are green in the same working tree:

- Root and worker typechecks
- Focused builder regression suite
- Full app test suite
- Full worker test suite
- HTTP smoke
- Authenticated browser E2E for builder creation/refinement paths
- Production or isolated production build

## Current Assessment

The current working tree is green across root typecheck, worker typecheck, full app tests, full worker tests, app smoke, authenticated browser E2E smoke, and isolated production build. Remaining production risk is external-service dependent behavior that local deterministic E2E intentionally does not cover, including live model gateway responses, live OAuth provider callbacks, provider-specific webhook delivery, and live runtime provider deployment.
