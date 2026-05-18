/**
 * PM Sync — Adapter Bootstrap.
 *
 * Side-effect import that registers all PM adapters with the worker-side
 * registry. Call once at worker startup when FEATURE_PM_SYNC is enabled.
 * Each adapter barrel file (`adapters/<provider>/index.ts`) self-registers
 * via `registerAdapter()`.
 *
 * Adding a new adapter: import its barrel file here. That's it.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.6
 */

// Linear
import './adapters/linear/index.js'

// Asana
import './adapters/asana/index.js'

// Trello
import './adapters/trello/index.js'

// Monday
import './adapters/monday/index.js'
