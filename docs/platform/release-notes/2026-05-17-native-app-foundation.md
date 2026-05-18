# Native App Foundation

Date: 2026-05-17
Status: Local foundation implemented

## Shipped

- Added shared `@lucid/app-core` deep-link parsing and route resolution.
- Added shared `@lucid/app-client` bootstrap and native device client methods.
- Added Electron desktop shell under `apps/desktop` with secure BrowserWindow defaults, preload bridge, deep links, menu/tray routes, local notifications, update guard, fallback renderer, and package smoke.
- Added Next web bridge for `window.lucidDesktop` deep-link dispatch.
- Added `/api/native/bootstrap`, `/api/native/devices`, `/api/native/devices/[id]`, and `/api/native/notifications/preferences`.
- Added native device Supabase migration with hashed/encrypted push token storage and RLS.
- Added Expo mobile companion scaffold under `apps/mobile` with tabs, native deep-link mapping, secure-token storage, and bootstrap client usage.
- Added native app CI workflow.

## External Release Handoffs

- Added native release preflight coverage for desktop signing, EAS build credentials, EAS submit credentials, push credential readiness, and `ENCRYPTION_KEY`.
- Added manual native release workflow for signed Mac/Windows desktop artifacts, EAS preview/production builds, and EAS submit.
- External provider accounts still need real Apple, Windows, Expo, APNS, FCM, and store credentials added through GitHub secrets and EAS credential management. See `docs/platform/native-release-ops.md`.
- `ENCRYPTION_KEY` already exists in Vercel Development, Preview, and Production; do not rotate it for native release unless a separate key-rotation migration is planned.

## Local Validation

- `npm run native:foundation:typecheck`
- `npm run native:foundation:test`
- `npm run typecheck`
- `npm --prefix apps/desktop run package`
- `npm --prefix apps/desktop audit --omit=dev`
- `npm --prefix apps/mobile run doctor`
- `npm --prefix apps/mobile audit --omit=dev`
- `git diff --check`
