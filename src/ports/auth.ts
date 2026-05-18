/**
 * Auth Port (Re-export)
 * Import from here to keep your options open for future changes
 */

export { getServerSession, requireUserId } from '@/lib/auth/session';
export type { ServerSession as Session } from '@/lib/auth/session';
