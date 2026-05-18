# @lucid/browser-checkout-adapter

Internal SDK-style package for Browser Operator merchant checkout adapters.

It keeps first-party and future community adapters on one contract:

- versioned adapter manifests
- merchant reliability tiers and capability declarations
- deterministic domain/key matching
- fixture builders for cart/receipt/failure cases
- conformance helpers for fail-closed checkout safety

Adapters are intentionally declarative-first. Browser execution still goes through Lucid Browser Gateway, and purchase authority still goes through Agent Commerce.

## Lifecycle

- `planned`: visible in Mission Control, never executable
- `sandbox_ready`: executable only for sandbox/demo merchants
- `staging_ready`: executable in staging/sandbox merchant environments
- `live_ready`: executable for real checkout after security and receipt verification
- `deprecated`: visible but blocked
- `blocked`: disabled for safety

## Safety Rules

- No adapter may launch a browser directly.
- No adapter may handle raw payment credentials.
- No adapter may claim `auto_buy_supported` unless its reliability tier is `live_supported`.
- Final purchase must require an approval or standing policy decision.
- Duplicate idempotency keys must not place a second order.
- Receipt parser confidence must be verified before live readiness.

## Reliability Tiers

- `live_supported`: auto-buy is allowed inside policy.
- `assisted`: browse/cart/receipt work can run, but checkout may need takeover.
- `research_only`: research/extract only, no checkout promise.
- `blocked`: disabled for safety.
