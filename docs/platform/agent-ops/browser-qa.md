# Browser Operator And Browser QA

Browser Operator is Lucid's shared browser capability for Agent Ops. It lets workflows observe, test, extract, monitor, and operate on web surfaces through isolated browser sessions.

Browser QA is one workflow on top of Browser Operator. Use Browser QA when you want an agent to verify a page the way a user would experience it, then attach evidence to the run.

For the broader Agent Ops workflow model, see [Agent Ops Overview](overview.md).

## What Browser Operator Can Do

Browser Operator can support:

- page checks and screenshots
- flow testing
- structured extraction from pages
- competitor or market research
- recurring monitoring
- support issue reproduction
- governed portal operations
- cart building and buying through Agent Commerce
- controlled portal operations with approval gates

## What Browser QA Captures

Browser QA can collect:

- screenshot evidence
- final URL and page status
- console errors and warnings
- page errors
- failed or slow network requests
- basic performance timing
- structured findings, risks, and next actions

The result appears as Agent Ops evidence so teammates can review what happened without rerunning the browser manually.

## How It Works

Lucid keeps Browser Operator provider-neutral.

Your workflow asks for a browser check. Lucid routes that request to an isolated browser gateway or dedicated browser worker, captures evidence, stores artifacts, and links the results back to Mission Control.

Normal users do not need to choose between Playwright, OpenClaw, Hermes, Steel, Browserless, or other browser providers. Those are runtime configuration details handled by administrators.

The scalable default is Lucid-owned Playwright capacity in isolated browser services. Hosted providers are optional adapters for hard cases, not the default cost model. Keep `BROWSER_OPERATOR_EXTERNAL_PROVIDERS_ENABLED=false`, `BROWSER_OPERATOR_BYO_PROVIDERS_ENABLED=false`, and `BROWSER_OPERATOR_PREMIUM_FALLBACK_ENABLED=false` for Lucid-only mode. When enabled later, read-only public work may fallback across providers; authenticated accounts and commerce checkout stay pinned to their connected provider/profile and fail closed if that profile is degraded.

Lucid browser gateways now expose pool health separately from provider health. The pool enforces a global concurrency cap, a per-org lease cap, a bounded lease wait timeout, session TTL cleanup, memory-pressure blocking, active session counts, queue depth, lease wait metrics, crash counts, and an estimated active browser cost. This keeps browser work from starving channels, automation, or normal Agent Ops workers.

The gateway uses Playwright internally, but exposes a governed Browser Operator action contract instead of raw Playwright handles. Current first-class actions cover navigation, snapshots, screenshots, wait-for-selector, click, hover, press, type/fill, select, check, uncheck, scroll, high-level extract/action-layer calls, approved-only JavaScript evaluation for internal diagnostics, and approved-only submit. Typed values are not written to usage metadata, and sensitive auth/payment fields are blocked from automated typing based on selector text plus DOM attributes, labels, and nearby context.

For authenticated work, `browser_operator_profiles` records Lucid-owned profile affinity. For heavy customer-owned usage, `browser_operator_byo_runtimes` records BYO CDP endpoint refs, token refs, allowlisted domains, privacy mode, and health state. Neither table stores raw passwords or payment details.

Provider auth can be Nango-backed. Browser Operator accounts and BYO runtimes expose `auth_provider`, `auth_connection_id`, and optional `org_connection_id` refs so Browserbase, Steel, Browserless, custom merchant APIs, or customer CDP runtime credentials can authenticate through Nango while Lucid still owns browser routing, profile affinity, policy, evidence, and receipts. Browserbase, Steel, Browserless, and Custom Browser Runtime are seeded as normal Settings integrations, so teams connect them from the same integrations surface as Slack/Linear/etc. Nango is the auth/proxy layer, not the browser execution backend, and the centralized Nango service must have matching provider configs before those Connect buttons can complete.

For managed Lucid agents, Lucid owns the account/session control plane. Browser providers are execution backends only. Lucid stores the canonical merchant account, sanitized credential/session refs, purchase policies, audit events, idempotency, receipts, and Knowledge/Memory provenance. Provider refs such as Browserbase contexts or Steel profiles are adapter handles; if a provider changes, the user may need to reconnect once, but Lucid keeps the policy, history, receipts, and memory.

Credential strategy is ordered by safety:

1. Official OAuth, API, or delegated access.
2. Persistent browser session/profile after secure user takeover.
3. Provider-managed credential vault when the user opts in.
4. Lucid-managed raw credential vault only as a last resort, behind feature flag, explicit consent, KMS/envelope encryption, gateway-only access, audit events, and revocation.

Agents never receive raw credentials, provider secrets, or `secret_ref` values in runtime packets.

## Browser Buying And Agent Commerce

Browser Operator can build carts, compare options, and prepare checkout flows. Agent Commerce owns the spend decision.

Lucid now treats buying as a rail-planning problem, not a browser-only problem. Before a purchase run can move toward checkout, the Browser Operator purchase planner chooses one rail:

- `merchant-native commerce`: controlled/self-serve source-linked rails such as Shopify cart APIs, Kroger cart handoff, Walgreens add-to-cart, Rye, or future approved partner APIs.
- `authenticated browser`: a connected merchant account with an active, provider-pinned profile/context.
- `assisted handoff`: CAPTCHA, MFA, payment attention, anti-bot checks, or unreliable merchant state requires user takeover.
- `research-only`: Lucid can browse, compare, extract, or prepare evidence, but cannot safely buy.

Native merchant capabilities are tracked separately from browser adapters. They live in `browser_operator_merchant_native_capabilities` and are selected by `src/lib/browser-operator/native-capabilities.ts`. Browser/proxy policy is also explicit: proxies may support read-only browsing or pre-checkout reliability, but checkout cannot silently change provider, profile, or proxy after cart approval.

Agent Commerce native rails are the executable/API-facing side of that inventory. They live in `src/lib/agent-commerce/native-rails/*` and currently register only realistic self-serve/controlled rails: Lucid sandbox, Shopify Storefront cart handoff, Kroger cart handoff, Walgreens add-to-cart, and Rye. Partner-gated rails stay out of runtime code until access is real. Only Lucid sandbox is executable today. Real rails are requested/research candidates that fail closed until credentials, sandbox merchant flow, live merchant flow, approval boundary, idempotency guard, receipt parser, reconciliation/webhook or polling, fail-closed tests, and source/terms review pass the native rail promotion gate.

The user-facing commerce identity is the Purchase Passport. It groups connected merchant accounts, standing policies, budget/consent constraints, opaque address/payment refs, purchase evidence, and revocation state. Agents receive only policy-derived capabilities from the passport; raw passport, address, payment, and credential records stay in the Lucid control plane.

A safe buying flow is:

1. User connects a merchant account once.
2. User defines a standing purchase policy, such as max budget, allowed merchants, categories, substitutions, delivery constraints, and approval mode.
3. Purchase planner selects merchant-native, authenticated browser, assisted handoff, or research-only.
4. Browser Operator or the selected native rail prepares the cart/evidence.
5. Trust Shield and the purchase policy evaluate the cart hash, total, merchant, category, substitution, provider/profile/proxy affinity, and delivery rules.
6. Agent Commerce creates or checks the spend request, idempotency key, approval, rail, and receipt requirements.
7. The final purchase is blocked unless the standing policy allows auto-approval or a human approves the exact cart.
8. Mission Control stores replay, cart, policy decision, approval, receipt, and memory candidates.

The `/mission-control/browser` cockpit now includes merchant accounts, secure takeover sessions, account readiness, operator alerts, and standing purchase policies alongside sessions, procedures, playbooks, capacity, and Trust Shield events.

Operators can create, update, revoke, and request secure takeover connection sessions for merchant accounts from the cockpit. Browserbase and Steel connection adapters create provider profile/context/session handles when their API envs are configured; Lucid-managed sessions use the same durable connect-session record and takeover page. After a user logs in once and marks the takeover connected, the account can be reused by governed browser runs without putting credentials into agent context.

Account readiness is durable, not just a UI guess. Browser Operator records `browser_operator_account_health_snapshots` for connected merchant accounts and deduped `browser_operator_alerts` for reconnect, expiry, MFA, CAPTCHA, profile degradation, handoff, blocked purchase, missing receipt, and provider-health issues. The console shows a simple operator inbox: what needs attention, why, and the safest next action. Secure takeover completion refreshes account health automatically and resolves stale account alerts when the session is ready again.

Checkout execution stays fail-closed. Purchase runs evaluate cart, merchant, category, budget, substitution, idempotency, and approval state before execution. If a policy allows auto-approval and the merchant account is connected, Lucid can execute only through an executable checkout adapter with a `live_supported` reliability tier and capture a receipt row. The built-in sandbox adapter is executable for tests, demos, staging smoke, and receipt plumbing; it never places a real order.

Live merchants are represented by explicit adapter manifests before they are executable. Mission Control shows each merchant as one of:

- `Auto-buy supported`: validated merchant can buy inside approved policy.
- `Assisted checkout`: Lucid can browse/cart/parse evidence but may need takeover for CAPTCHA, MFA, payment, address, or final submit.
- `Research only`: Lucid can research/compare/extract but does not promise checkout.
- `Blocked`: merchant disabled for safety/compliance.

The first priority manifests are Shopify storefronts, Amazon/Amazon Fresh, Instacart, Walmart, and Carrefour France. Amazon, Shopify, and Carrefour currently expose adapter-family parsing/matching foundations as assisted checkout; Instacart and Walmart remain research-only until their merchant-specific fixture packs exist. Execution is blocked before checkout side effects until all merchant-specific requirements are satisfied:

- connected browser account and active provider profile
- merchant flow verified against the current site
- final-cart verification and duplicate-order/idempotency guard
- approval boundary for checkout/submit/purchase
- receipt parser verified from receipt page, order history, or email receipt
- sandbox/live merchant test account and provider credentials configured

This means Browser Operator can show the operator exactly which stores are auto-buy, assisted, research-only, or blocked, while still refusing to pretend autonomous buying is live for real stores.

Adapter authors should use the internal SDK foundation in `packages/browser-checkout-adapter`. It provides the versioned manifest contract, lifecycle states, merchant reliability tiers, capability declarations, fixture builder, domain matching, and conformance helpers. Scaffold new adapters with `npm run browser-checkout:adapter:create <merchant>` and verify the registry with `npm run browser-checkout:adapter:conformance`.

## Procedures And Playbooks

Successful browser runs can become reusable Browser Operator procedures.

Procedures capture a repeatable task, while host playbooks capture trusted knowledge for a specific site or domain. Both are scoped to the tenant and remain visible in Mission Control, so teams can reuse what works without hiding browser behavior inside local scripts.

Mission Control exposes a Browser Operator cockpit at `/mission-control/browser`. It combines procedures, host playbooks, live sessions, session sharing, and Trust Shield state. Operators can activate, quarantine, block, or restore procedures and playbooks from that cockpit, while handoff and resume actions write audited session events instead of calling a browser provider directly.

Common examples:

- "Check the signup page after each deploy"
- "Extract the current pricing table from this competitor site"
- "Use this support portal playbook when reproducing customer issues"
- "Monitor this changelog page for product updates"

## Live Handoff And Sharing

Some browser work needs a human in the loop for login, CAPTCHA, MFA, or judgment calls.

Browser Operator can record live session events, expose handoff state in Mission Control, and use scoped sharing so another agent or operator can inspect the same browser session. Shared access should be revocable and audited.

## When To Use It

Good Browser Operator workflows include:

- "Check this landing page"
- "Test the signup funnel"
- "Buy weekly groceries under a budget"
- "Research this competitor site"
- "Extract pricing data from this page"
- "Monitor this page daily"
- "Reproduce this customer issue"

Channel-native shortcuts use the same Agent Ops workflow registry:

- `check <url>` launches `check-page`
- `buy <request>` launches `buy-stuff` and remains approval-gated/fail-closed for checkout
- `research <url>` launches `research-site`
- `extract <what> from <url>` launches `extract-data`
- `monitor <url>` launches `monitor-page`
- Slack uses `/lucid check <url>` and Telegram uses `/check <url>` for the same flow.

Good Browser QA targets include:

- "QA this URL before release"
- "Canary this deployment"
- "Check the checkout flow"
- "Review this landing page"
- "Capture evidence for a bug report"
- "Confirm this page has no console or network failures"

Browser-powered workflows are strongest when paired with a clear target URL and a concrete acceptance goal.

## Evidence And Retention

Screenshots and large browser artifacts are stored as durable evidence instead of being embedded directly in chat messages.

Admins can configure retention windows so old sessions, screenshots, and usage records are cleaned up automatically. This keeps Browser QA useful for audits without allowing browser data to grow forever.

## Safety And Isolation

Lucid runs Browser QA with safety boundaries:

- separate browser context per session
- no shared cookies between organizations
- private/internal network targets blocked by default in shared environments
- explicit dedicated runtime configuration for private-network testing
- per-run and per-plan usage limits
- short session TTLs
- trust-shield events for prompt injection, canary, private-network, fixture, and unsafe replay signals
- gateway-level rejection of runtime packets containing secret handles or password/token/API-key fields
- approval gates for medium/high-risk actions like submit, publish, delete, transfer, or purchase
- human takeover for sensitive login, MFA, CAPTCHA, card, CVV, and payment fields
- provider-health and replay endpoints so operators can inspect provider readiness and step timelines without exposing provider secrets

This lets teams use real browser evidence without mixing tenant state or making the main agent worker responsible for browser isolation.

## Availability

Browser Operator can run in:

- managed Lucid browser gateways
- isolated `WORKER_MODE=browser` workers
- dedicated runtime deployments with an approved browser provider
- compatible external browser-control services

If Browser Operator is unavailable, workflows should return a clear unavailable finding instead of pretending the page was tested.

## Production Verification

The current production runbook is [Agent Ops Production Runbook](production-runbook.md).

As of the latest verified production snapshot on 2026-05-11:

- Railway `Lucid`, `lucid-channels`, `lucid-automation`, and `lucid-browser` were healthy.
- The web/control-plane `/ready` endpoint returned unauthenticated `200` JSON.
- The isolated Browser Operator gateway `/ready` endpoint was healthy.
- Browser Operator live smoke completed against `https://www.lucid.foundation` with screenshot/evidence artifacts.
- Slack channel-launch API smoke created completed `check-page` runs with Browser Operator artifacts and channel-launch metadata.
- A 15-minute log watch showed no duplicate runs, auth failures, entitlement fallback, RLS errors, Browser Operator provider failures, or alert spam.

Production UI smoke for `/mission-control/browser` still requires an authenticated production browser session. Do not mark the UI click-through complete from an unauthenticated login page alone.
