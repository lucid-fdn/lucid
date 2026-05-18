/**
 * Trello Adapter Barrel — side-effect registration.
 *
 * Importing this module registers the Trello adapter with the worker-side
 * PM sync registry. Bootstrap imports this at startup so
 * `getAdapter('trello')` resolves.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section C.3
 */

import { registerAdapter } from '../../registry.js'
import { trelloAdapter } from './trello-adapter.js'

registerAdapter(trelloAdapter)

export { trelloAdapter }
