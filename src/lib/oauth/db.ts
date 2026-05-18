/**
 * OAuth Connection Database Operations (Server-only)
 *
 * DEPRECATED: This module previously contained functions that called RPCs
 * on the `user_oauth_connections` table. Those RPCs were never applied to
 * the database, so every call silently failed.
 *
 * The actual OAuth connection state is managed by:
 *   - `assistant_oauth_bindings` — per-assistant UI connection status
 *   - `org_integration_connections` — org-level worker credential resolution
 *
 * This file is intentionally empty. Keeping it avoids broken imports during
 * the transition. Remove once all import sites are cleaned up.
 */

import 'server-only'
