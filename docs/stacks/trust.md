# Trust Stack

**Status:** Active
**Stack ID:** `trust`

Trust is the cross-cutting safety layer: authentication, authorization, approvals, policy, secrets, credentials, runtime keys, entitlements, and fail-closed behavior.

Every stack that mutates state, spends money, exposes private data, or controls external systems depends on Trust.

## Owns

- Identity and org membership checks.
- Runtime key validation.
- Internal HMAC/API authentication.
- Approval gates.
- Policy enforcement helpers.
- Secret reference boundaries.
- Entitlement checks.
- Safety gates for money-moving or externally visible actions.

## Does Not Own

- Provider business logic.
- Operator page layout.
- Agent planning semantics.
- App frontend generation.

## Current Surfaces

- `src/lib/auth/`: provider-agnostic auth adapter.
- `src/lib/access-control/`: access-control helpers.
- `src/lib/mission-control/approval-gate.ts`: approval gate logic.
- `packages/agent-bridge/src/approval-gate.ts`: BYO runtime approval client behavior.
- `src/lib/credentials/`: credential helpers.
- `src/lib/db/provider-keys.ts`: BYOK provider key storage, safe metadata reads, and TrustGate sync state.
- `src/components/gateway/provider-keys-client.tsx`: Provider Keys UX for add, validate, activate/deactivate, delete, and TrustGate sync status.
- `src/components/assistants/assistant-detail-client.tsx`: assistant inference policy selector for Auto, Lucid managed, and BYOK only.
- `src/lib/entitlements/`: entitlement gates.

## Integration Rules

- Policy-sensitive mutations must derive identity from verified auth/runtime/internal context.
- Caller-supplied IDs can select resources only after ownership and membership checks.
- Secrets are referenced by opaque secret refs; raw secrets never leave the provider/secret boundary.
- Workspace BYOK keys must be stored encrypted, exposed to browsers only as safe metadata, and routed through TrustGate policy. Runtime choice cannot bypass TrustGate, approval, budget, or audit policy.
- Dedicated runtime UI must not expose provider operation IDs, raw environment snapshots, image refs, deployment URLs, or internal provider errors. BYO runtime UI may show user-owned endpoint and adapter metadata, but raw environment snapshots remain hidden.
- Money-moving, data-exporting, or externally posting actions need explicit policy classification.
- Fail closed on auth, policy, idempotency, or proof-claim storage errors.

## Lucid-L2 Safety Lessons

The Lucid-L2 audit findings in `docs/BACKLOG.md` become Trust design rules:

- public routes must never spend with server credentials,
- ownership checks must be mandatory on mutation,
- trading or wallet routes must not trust caller-supplied user IDs,
- replay protection must be atomic,
- validation must be mounted at the route/service boundary.

## Backlog Direction

- Add a shared internal HMAC helper for Agent Commerce APIs if one does not already fit.
- Add approval policy classification for commerce tools.
- Add tests proving caller-supplied identity cannot authorize commerce execution.
