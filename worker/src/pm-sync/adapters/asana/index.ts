/**
 * Asana Adapter Barrel — side-effect registration.
 *
 * Importing this module registers the Asana adapter with the worker-side
 * PM sync registry. Bootstrap imports this at startup so
 * `getAdapter('asana')` resolves.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section C.2
 */

import { registerAdapter } from '../../registry.js'
import { asanaAdapter } from './asana-adapter.js'

registerAdapter(asanaAdapter)

export { asanaAdapter }
