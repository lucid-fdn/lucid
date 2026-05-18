// Retail funnel constants. Safe for both server and client imports —
// no `server-only` here, so it can be reached from server components,
// route handlers, and tests without dragging in the server boundary.

/**
 * Metadata flag we set on the personal org auto-provisioned by the retail
 * funnel. `ensureRetailOrg` writes it; pages and queries read it back to
 * find a user's retail org without inventing a new column.
 *
 * Single source of truth — both `retail-org.ts` (server) and the retail
 * page (server component) import from here.
 */
export const RETAIL_ORG_FLAG = 'retail_personal_org'
