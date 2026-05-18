# App Service Stack

**Status:** Foundation
**Stack ID:** `app_service`

App Service turns Lucid capabilities into generated or hosted agent-service apps. It provides public and operator runtime APIs so generated apps can safely interact with agents, teams, workflows, integrations, AgentOps, and eventually Commerce.

## Owns

- App Service specs.
- Generated frontend safety boundaries.
- Public App Runtime API contracts.
- Operator App Runtime API contracts.
- App deployment settings and readiness checks.
- App-scoped runtime gateways.

## Does Not Own

- Core Mission Control route family.
- Agent runtime engine internals.
- Raw provider credentials.
- Commerce provider execution.

## Current Surfaces

- `contracts/app-service.ts`: App Service Foundry contracts.
- `contracts/app-runtime.ts`: public/operator runtime API contracts.
- `src/lib/app-service/`: app service planning, generation, readiness, safety, observability, gateway logic.
- `src/app/api/app-runtime/`: public/operator app runtime APIs.
- `src/app/api/app-services/`: app service management APIs.
- `packages/app-runtime-sdk/`: app runtime SDK package.
- `scripts/lucid-app-service.ts`: local operator CLI for catalog, generation, launch, token, and origin workflows.

## Integration Rules

- Generated apps consume Lucid through App Runtime APIs, not internal route families.
- Operator runtime APIs must enforce Trust capabilities.
- App-scoped AgentOps should be a filtered view over AgentOps events, not a separate truth store.
- App Service may expose paid public actions only through Agent Commerce.
- Frontend generation must never embed org IDs, provider keys, runtime config, OAuth tokens, or secret references.
- Blueprint upgrade metadata and MCP/A2A discovery metadata are schema anchors only until there is a reviewed runtime surface for them.

## Local DX

- `npm run app-runtime-sdk:typecheck`: typecheck the SDK package used by generated apps.
- `npm run app-runtime-sdk:test`: run SDK client tests.
- `npm run app-service:cli -- help`: inspect the local App Service CLI.
- `npm run app-service:cli -- catalog`: read the small static platform blueprint catalog.
- `npm run app-service:cli -- token create --app-id <id> --capability chat`: mint an app-scoped public runtime token.
- `npm run app-service:cli -- origin add --app-id <id> --origin https://app.example.com`: allow an embed origin.

## Commerce Integration

App Service should eventually support:

- paid public actions,
- paid API endpoints,
- paid generated app usage,
- seller-side grants,
- Commerce policy declarations in app specs,
- AgentOps traces for payment challenges and settlements.

## Backlog Direction

- Add App Runtime Commerce capability only after Commerce ledger and proof claim paths exist.
- Connect `runtime-gateway/agentops.ts` to real AgentOps data.
- Keep generated code guards current with new Commerce route families.
