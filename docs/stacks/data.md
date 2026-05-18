# Data Stack

**Status:** Active
**Stack ID:** `data`

Data owns durable state patterns across Lucid: schema evolution, migrations, queues, locks, ledgers, events, memory, and idempotency.

The stack is not "the database folder." It is the set of rules that keep cross-stack state consistent under retries, worker restarts, webhook duplication, and concurrent agent execution.

## Owns

- Schema migration strategy.
- Idempotency and locks.
- Event persistence.
- Ledger storage primitives.
- Queue and lease state.
- Memory and retrieval data contracts.
- Self-hosted bootstrap parity.

## Does Not Own

- Business policy decisions.
- Provider SDK mapping.
- Operator UX.
- Runtime engine behavior.

## Current Surfaces

- `supabase/migrations/`: incremental migration path.
- `docker/bootstrap/000_base_schema.sql`: Docker-first self-hosted base schema.
- `src/lib/db/`: control-plane DB helpers.
- `worker/src/db/`: worker DB helpers and compatibility utilities.
- `worker/src/pulse/`: queue, DAG, and worker state.
- `src/lib/locks/` and `worker/src/locks/`: lock helpers.

## Integration Rules

- New stack data must have migration, helper/API boundary, and tests proportional to risk.
- Idempotency and proof claim paths must be atomic.
- Webhooks must be deduped before mutating business state.
- DB helpers should return domain types or validated records, not provider payloads.
- RLS/ownership changes require explicit tests.

## Agent Commerce Requirements

Commerce needs:

- `agent_commerce_connections`,
- `agent_commerce_policies`,
- `agent_spend_requests`,
- `agent_commerce_credentials`,
- `agent_commerce_ledger_events`,
- `agent_commerce_idempotency_keys`,
- `agent_commerce_machine_proof_claims`,
- webhook event dedupe storage,
- reconciliation job state.

## Backlog Direction

- Add Commerce foundation migration only after contracts are expanded.
- Add atomic claim RPCs for machine-payment proofs.
- Add stale approval and reconciliation job storage.
