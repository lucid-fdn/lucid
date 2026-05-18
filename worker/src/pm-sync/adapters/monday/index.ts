/**
 * Monday.com Adapter Barrel — side-effect registration.
 *
 * Importing this module registers the Monday adapter with the worker-side
 * PM sync registry. Bootstrap imports this at startup so
 * `getAdapter('monday')` resolves.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section C.4
 */

import { registerAdapter } from '../../registry.js'
import { mondayAdapter } from './monday-adapter.js'

registerAdapter(mondayAdapter)

export { mondayAdapter }
