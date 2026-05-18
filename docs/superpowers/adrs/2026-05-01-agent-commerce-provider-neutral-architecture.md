# ADR: Provider-Neutral Agent Commerce Architecture

**Status:** Accepted
**Date:** 2026-05-01
**Owner:** Agent Commerce

## Context

Stripe announced Link wallets for agents at Sessions 2026: users can connect an agent to Link, approve spend requests, and let Link issue a one-time-use card or Shared Payment Token without exposing raw credentials. Stripe also documents Agentic Commerce, Issuing for agents, SPTs, MPP, and x402 as related but distinct rails.

Lucid needs both sides:

- **Lucid as agent platform:** Lucid/OpenClaw/Hermes agents can request user-approved spending for shopping, reservations, supplier payments, and workflow execution.
- **Lucid as seller:** external agents can pay Lucid for plans, app services, APIs, generated apps, or usage.

The open-source repo must remain runtime-agnostic, engine-agnostic, and provider-switchable. Stripe Link is an adapter, not the architecture.

A Lucid-L2 audit on 2026-05-01 found valuable protocol patterns around x402, payment facilitators, receipts, passports, and agent wallets, but also blocking risks in public money-moving routes, optional passport ownership checks, caller-supplied user identity, non-atomic x402 replay protection, and late OpenAPI validation. Those findings are tracked in `docs/BACKLOG.md` under "Agent Commerce / Lucid-L2 Security Gates".

## Decision

Introduce a provider-neutral **Agent Commerce** boundary:

- Agent Commerce uses the shared `commerce` stack ID from `contracts/stack.ts` and is documented in `docs/stacks/commerce.md`.
- Shared contracts live in `contracts/agent-commerce.ts`.
- Control-plane provider interfaces live in `src/lib/agent-commerce/*`.
- Engines and workers may consume contracts and call control-plane/internal APIs, but must not import Stripe SDKs or provider-specific Link code directly.
- Provider IDs are explicit: `stripe_link_agents`, `stripe_issuing`, `stripe_shared_payment_tokens`, `machine_payments_mpp`, `machine_payments_x402`, `crypto_wallet`, and `manual`.
- Agent spend requests are the stable Lucid primitive. Provider credentials are outputs, never the durable source of truth.
- Seller-side payment grants are separate from agent-wallet spend requests so Lucid can accept SPTs/machine payments without coupling checkout to a specific agent runtime.
- A deterministic `RailPolicyRouter` / `CommerceRailResolver` selects eligible rails from normalized commerce intents and policy. It does not execute provider side effects.

## Architecture Rules

- **No provider lock-in:** all provider calls sit behind `AgentWalletCommerceProvider` or `SellerAgentCommerceProvider`.
- **No engine lock-in:** OpenClaw, Hermes, dedicated runtimes, and generated apps use the same contracts.
- **Fail closed:** agent commerce is dark-launched behind feature flags and policy evaluation.
- **No raw credential persistence:** one-time cards, SPT secrets, OAuth tokens, and wallet credentials must be stored only through encrypted secret references.
- **Human approval first:** spend policies default to approval-required until a provider and product surface support scoped autonomy.
- **Auditable by default:** spend request IDs, run IDs, assistant IDs, merchant context, policy decisions, provider request IDs, and final payment IDs must reconcile.
- **Verified identity only:** execution paths derive user/org/assistant/run identity from LucidMerged auth and internal context, never from caller-supplied `userId`, owner, wallet, or passport fields.
- **Router selects, adapters execute:** rail routing is a policy decision; provider adapters perform execution only after ledger reservation and approval.
- **Ledger before side effect:** every spend, credential issuance, proof redemption, and seller grant is reserved with an idempotency key before any provider call.
- **Atomic proof consumption:** x402/MPP-style proofs must be consumed with one atomic operation and fail closed if replay protection is unavailable.
- **Lucid-L2 route isolation:** LucidMerged may reuse Lucid-L2 interfaces and patterns, but must not expose Lucid-L2 public money-moving routes as production execution paths until the P0 risk backlog is closed.

## Consequences

The first Stripe Link Agents implementation can land as an adapter when stable API access is available. Until then, the repo has a clean manifest and policy boundary for early-access work without leaking Stripe assumptions into worker tools or app services.

The same boundary can later support:

- Link OAuth + spend request approval,
- Stripe Issuing single-use virtual cards,
- Stripe SPT seller acceptance,
- x402 and MPP machine payments,
- crypto-wallet rails,
- self-hosted/manual approval flows.

Lucid-L2 remains a useful upstream reference, especially for payment facilitator interfaces, receipts, and x402 semantics. Direct integration is limited to reviewed library-level contracts/patterns until the Lucid-L2 risk backlog is resolved.

## References

- Lucid stack architecture: `docs/stacks/README.md`
- Agent Commerce stack doc: `docs/stacks/commerce.md`
- Lucid stack ID contract: `contracts/stack.ts`
- Lucid app-side stack definitions: `src/config/lucid-stacks.ts`
- Lucid Agent Commerce spec: `docs/superpowers/specs/2026-05-01-agent-commerce-architecture-design.md`
- Lucid Agent Commerce implementation plan: `docs/superpowers/plans/2026-05-01-agent-commerce-link-and-machine-payments-plan.md`
- Stripe blog: `https://stripe.com/blog/giving-agents-the-ability-to-pay`
- Stripe Agentic Commerce docs: `https://docs.stripe.com/agentic-commerce`
- Stripe Issuing for agents docs: `https://docs.stripe.com/issuing/agents`
- Link for agents: `https://link.com/agents`
- Lucid-L2 risk backlog: `docs/BACKLOG.md` under "Agent Commerce / Lucid-L2 Security Gates"
