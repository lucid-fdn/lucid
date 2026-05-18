import 'server-only'

import {
  createOrganization,
  findUserOrgByMetadataFlag,
} from '@/lib/db'

import { RETAIL_ORG_FLAG } from './constants'

function makeRetailSlug(userId: string): string {
  // Stable, namespaced, ≤ 60 chars. Full UUID hex (32 chars) → zero collision
  // risk even across millions of users, well under the 60-char limit.
  const stripped = userId.replace(/-/g, '').toLowerCase()
  return `retail-${stripped}`.slice(0, 60)
}

/**
 * Returns the user's retail personal org ID, creating one on first call.
 *
 * Idempotent and race-safe: concurrent first-time submissions both hit the
 * unique slug constraint, and the loser re-reads the winner's org. Throws
 * only on hard DB failures after that.
 */
export async function ensureRetailOrg(userId: string): Promise<string> {
  const existing = await findUserOrgByMetadataFlag(userId, RETAIL_ORG_FLAG)
  if (existing) return existing

  try {
    return await createOrganization(
      {
        slug: makeRetailSlug(userId),
        name: 'My agents',
        type: 'personal',
        metadata: { [RETAIL_ORG_FLAG]: true },
      },
      userId,
    )
  } catch (err) {
    // Race: another in-flight request for the same user won the unique slug.
    // Postgres `unique_violation` = 23505. Re-read; the winner has already
    // inserted the org row, but `createOrganization` is a two-step insert
    // (org row → membership row) and the membership row may still be in
    // flight when we look. `findUserOrgByMetadataFlag` joins through
    // `organization_members`, so we need to retry briefly until the winner's
    // transaction fully commits. Bounded at ~500ms total — if we still can't
    // see it, surface a clear error instead of silently returning the
    // original 23505.
    if ((err as { code?: string }).code === '23505') {
      for (const delayMs of [0, 50, 100, 150, 200]) {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
        const winner = await findUserOrgByMetadataFlag(userId, RETAIL_ORG_FLAG)
        if (winner) return winner
      }
      throw new Error(
        'Retail org provisioning race: winner row visible but membership not committed within 500ms',
      )
    }
    throw err
  }
}
