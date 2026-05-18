/**
 * PM Sync — Worker-side barrel.
 *
 * Worker-side counterpart to `src/lib/pm-sync/`. Adapters register here
 * via side-effect import from their own barrel files. The outbound sync
 * worker + reconcile cron consume the registry and type mirrors.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.2
 */

export * from './types.js'
export * from './errors.js'
export {
  hmacSha256,
  hmacSha256Base64,
  hmacSha1Base64,
  timingSafeEqual,
  parseSigHeader,
} from './webhook-verify.js'
export {
  registerAdapter,
  getAdapter,
  listRegisteredProviders,
  __resetRegistryForTests,
} from './registry.js'
