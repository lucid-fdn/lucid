/**
 * Linear Adapter Barrel — side-effect registration.
 *
 * Importing this module registers the Linear adapter with the worker-side
 * PM sync registry. The outbound sync worker imports this barrel at startup
 * so `getAdapter('linear')` resolves.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.2
 */

import { registerAdapter } from '../../registry.js'
import { linearAdapter } from './linear-adapter.js'

registerAdapter(linearAdapter)

export { linearAdapter }
