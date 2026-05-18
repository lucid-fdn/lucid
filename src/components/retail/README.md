# Retail components

Self-contained UI for the consumer retail funnel. See
`docs/plans/2026-04-07-consumer-retail-funnel.md` and the Phase 1 spec
(`docs/plans/2026-04-07-consumer-retail-phase1-spec.md`).

## Isolation rules (enforced by ESLint — see `eslint.config.mjs`)

Files under `src/components/retail/**`, `src/app/(retail)/**`, and
`src/lib/retail/**` MUST NOT import from:
- `src/app/(app)/**`
- `src/components/assistant/**`
- `src/components/mission-control/**`

If you need a primitive that lives in the pro app, lift it into a shared
location first (`src/components/ui/`, `src/ui/components/`, or
`src/components/shared/`) in a separate PR, then import from there.

Why: the retail funnel is a parallel surface. We want to evolve and delete
it independently of the pro app, with no entanglement.

## Folder layout (target — grows by phase)

    retail/
    ├── landing/        # Hero, gallery, social proof, pricing strip
    ├── wizard/         # 3-question create flow
    ├── tutorial/       # 5-step activation modal
    ├── fleet/          # Simple fleet (cards, not table)
    ├── detail/         # Simplified agent detail + soul/knowledge editors
    └── shared/         # Retail-only primitives (button overrides, tokens)

## Conventions

- Files: `kebab-case.tsx` (matches repo)
- Components: `PascalCase`
- Single quotes, no semicolons (matches repo Prettier config)
- Tailwind classes via `cn()` from `src/utils/cn.ts`
- Server components by default; `'use client'` only when needed
- Animations: 120/200/240ms. Never > 300ms.
- Use `ErrorService.captureException()` — never bare `console.error`
