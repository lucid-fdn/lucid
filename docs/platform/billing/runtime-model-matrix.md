# Runtime Model Matrix

Canonical source of truth for public pricing language, internal capability boundaries, and sales wording.

## Public Product Promise

- `Shared` = real autonomous agents on shared compute with platform-managed persistence
- `Dedicated` = Lucid-operated isolated runtime with stronger continuity, headroom, and optional native/runtime-local behavior where the engine supports it
- `BYO` = customer-operated runtime paired to Lucid through the runtime bridge; local machine details stay user-owned while Lucid keeps heartbeat, commands, probes, evidence, and policy visibility
- `TrustGate` = centralized inference boundary for Auto, Lucid managed, and BYOK-only routing
- `Starter` = $29 monthly or $24 monthly billed yearly ($288/year)
- `Growth` = $99 monthly or $79 monthly billed yearly ($948/year)
- `Scale` = $299 monthly, with annual handled through sales or explicit launch/founding pricing only
- `Enterprise` = custom pricing through sales

## Public Capability Table

| Plan | Price | Runtime | Best for | AI teams | Persistent memory | Long-running autonomy | Native/runtime-local continuity | Isolation |
|------|-------|---------|----------|----------|-------------------|-----------------------|----------------------------------|----------|
| Starter | $29/mo or $288/yr | Shared | Solo builders | 3 | Yes | Yes, with limits | No | Shared |
| Growth | $99/mo or $948/yr | Shared | Real production use | 10 | Yes | Yes | No | Shared |
| Scale | $299/mo, annual via sales | Isolated runtime | Heavy autonomy and continuity | 10+ | Yes | Strong | Best fit | High |
| Enterprise | Custom | Private or partner cloud | Security, compliance, custom ops | Custom | Yes | Strong | Best fit | Highest |

## Internal Architecture Rules

### Shared

- Source of truth is Lucid platform state, not runtime-local state
- Shared compute can run real autonomous agents
- Shared may provide persistent memory, schedules, multi-agent coordination, and observability
- Shared should not promise assistant-owned runtime-local continuity
- Shared self-improvement should stay platform-managed

### Dedicated

- Runtime has isolated identity
- Runtime-local continuity can matter operationally
- Better fit for heavier long-running execution, native channel behavior, and deeper runtime-local self-improvement where compatibility allows it
- Lucid still governs approvals, budgets, audit, and operator controls
- Client-facing runtime UI must stay Lucid-branded and sanitized: no provider operation ids, raw environment snapshots, deployment URLs, image refs, or internal provider errors
- Runtime maintenance includes first-class re-home for Lucid-operated runtimes. Re-home launches a fresh Lucid-managed deployment from the canonical worker image line, rotates the runtime key only after the replacement is accepted, and records native `action = "rehome"` in the maintenance ledger.

### BYO

- Runtime is operated by the workspace/user, not by Lucid
- Local machine probes, runtime binary availability, native process state, and secrets can be runtime-authoritative
- Lucid manages pairing, heartbeat/status, command requests, policy, evidence, mutation review, and EHV state projection
- BYO may expose user-owned endpoint and adapter metadata to that workspace, but raw environment snapshots still remain hidden

### Inference Routing

- Assistant inference mode is stored under `policy_config.trustgate.inference_mode`
- Modes are Auto, Lucid managed, and BYOK only
- Provider keys are added from Settings -> Provider Keys and synced to TrustGate. UI states cover invalid key validation, valid key save, active/inactive toggle, delete, and TrustGate sync failures.
- Runtime choice does not bypass TrustGate, budget, approval, or audit policy

## Runtime Parity Status

The current production verification record is [Runtime parity verification 2026-05-08](../mission-control/runtime-parity-verification-2026-05-08.md).

- Hermes and OpenClaw dedicated runtimes passed probe, parser, services, EHV snapshot/diff/export/rollback, and command ACK verification.
- Hermes dedicated re-home passed with native `action = "rehome"`, succeeded job status, fresh heartbeat/capability report, and no maintenance error.
- BYO Hermes and BYO OpenClaw passed heartbeat, command ACK, and chat-path smoke tests.

## Approved Site Copy

### Shared

Managed autonomous agents on shared compute with persistent platform-managed state.

### Dedicated

Isolated runtime with stronger continuity, higher limits, and better support for heavy long-running native execution.

## Approved Sales Copy

### Short version

- Shared is the real product: autonomous agents on Lucid-managed shared compute with persistent platform-managed memory and autonomous execution.
- Dedicated adds stronger continuity, more isolation, and more headroom for heavy or sensitive workloads.

### Objection handling

#### "Is shared just a demo tier?"

No. Shared supports real memory, scheduling, background work, and multi-agent coordination. Dedicated exists for stronger runtime continuity and isolation, not because shared autonomy is fake.

#### "Why would I pay for dedicated?"

Pay for dedicated when workload shape or compliance needs stronger isolation, more predictable long-running execution, or better runtime-local continuity.

#### "Does dedicated change the agent product?"

The core product stays the same. Dedicated changes runtime quality: continuity, headroom, isolation, and support for deeper native/runtime-local behavior.
