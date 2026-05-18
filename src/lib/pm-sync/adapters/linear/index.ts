/**
 * Linear Adapter Barrel — control-plane side-effect registration.
 *
 * Importing this module registers the Linear adapter with the control-plane
 * PM sync registry. The webhook dispatcher and org-config APIs import this
 * barrel at startup so `getAdapter('linear')` resolves.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section C.1
 */

import 'server-only'
import { registerAdapter } from '../../registry'
import { linearAdapter } from './linear-adapter'

registerAdapter(linearAdapter)

export { linearAdapter }
