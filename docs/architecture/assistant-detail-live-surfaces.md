# Assistant Detail Live Surfaces

## Goal

Keep the assistant detail page fast and predictable by separating:
- snapshot configuration data
- live operational data
- OAuth critical-path behavior

The assistant detail page should default to a configuration shell. It should not behave like a fully live mission-control console unless the operator opens the relevant live surface.

## Current Rule

### 1. Configuration-first shell

The assistant detail page is primarily:
- settings
- channels
- skills
- memories
- wallet
- runtime assignment
- verification

These surfaces should render from snapshot data first.

### 2. Visibility-driven live behavior

Live polling or realtime subscriptions should only run when the relevant UI surface is actually visible.

Current live surface model:
- `activity`
- `metrics`
- `runtimes`
- `health`

The page-level visibility contract lives in:
- [live-surfaces.ts](/C:/LucidMerged/src/components/assistant/live-surfaces.ts)

The command center reports visible surfaces from:
- [assistant-command-center.tsx](/C:/LucidMerged/src/components/assistant/assistant-command-center.tsx)

The page shell consumes and applies them in:
- [assistant-detail-client.tsx](/C:/LucidMerged/src/app/(app)/[workspace-slug]/assistants/[id]/assistant-detail-client.tsx)

## Canonical Hook Contract

The canonical realtime contract lives in:
- [use-realtime-query.ts](/C:/LucidMerged/src/hooks/use-realtime-query.ts)

Rules:
- `enabled` means the hook may do its initial fetch
- `liveEnabled` means realtime subscriptions and polling are allowed

This allows snapshot-only reads without keeping a hidden surface live.

Hooks already aligned to this contract:
- [use-assistant-activity.ts](/C:/LucidMerged/src/hooks/use-assistant-activity.ts)
- [use-realtime-metrics.ts](/C:/LucidMerged/src/hooks/use-realtime-metrics.ts)
- [use-runtimes.ts](/C:/LucidMerged/src/hooks/use-runtimes.ts)
- [use-health-score.ts](/C:/LucidMerged/src/hooks/use-health-score.ts)

## OAuth Critical Path

OAuth connect, verify, and disconnect are interactive critical paths.

They must not compete with unrelated live page traffic.

Current implementation:
- popup callback signaling:
  - [page.tsx](/C:/LucidMerged/src/app/oauth/callback/page.tsx)
- client-side flow orchestration:
  - [unified-skill-manager.tsx](/C:/LucidMerged/src/components/skills/unified-skill-manager.tsx)
- local flow state:
  - [flow-state.ts](/C:/LucidMerged/src/lib/oauth/flow-state.ts)
- network/session client:
  - [nango-fetch.ts](/C:/LucidMerged/src/lib/oauth/nango-fetch.ts)
- verify fallback:
  - [route.ts](/C:/LucidMerged/src/app/api/oauth/verify/route.ts)
- disconnect local-first cleanup:
  - [route.ts](/C:/LucidMerged/src/app/api/oauth/[provider]/route.ts)

Rules:
- popup success should signal before background refresh
- popup close without success should be treated as cancel unless verification proves otherwise
- remote Nango reads must fail fast
- persisted Lucid DB state is the fallback source of truth when the connection already exists

## Activity Feed Query Shape

The assistant activity endpoint should not use expensive relational filtering on every refresh.

Current shape:
1. load recent `assistant_conversations` for the assistant
2. load recent `assistant_messages` for those conversation ids
3. derive operational feed events from those messages

Implemented in:
- [route.ts](/C:/LucidMerged/src/app/api/assistants/[id]/activity/route.ts)

This keeps the assistant page activity feed materially cheaper than the old join-based shape.

## Design Guidance

When adding new assistant detail data:
- decide whether it is `snapshot` or `live`
- if it is live, bind it to a visible surface
- do not add page-global polling for hidden panes
- do not let OAuth flows wait on unrelated live surfaces

## Non-goals

This model does not try to:
- turn the assistant detail page into a pure static form
- remove mission-control-style live UX entirely
- replace realtime with only manual refresh

It only enforces that live behavior is explicit, scoped, and isolated from the configuration path.
