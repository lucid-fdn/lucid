import { NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getUserOrganizations } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/organizations/user
 * 
 * Returns all organizations the authenticated user belongs to
 * Used by nav-org-switcher to populate dropdown
 */
export async function GET() {
  try {
    const userId = await getUserId()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgs = await getUserOrganizations(userId)
    
    // Map to expected format for org switcher
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizations = orgs.map((item: any) => {
      const org = Array.isArray(item.organization) ? item.organization[0] : item.organization
      return {
        id: org?.id,
        slug: org?.slug,
        name: org?.name,
        logo_url: org?.logo_url,
        role: item.role,
        joined_at: item.joined_at
      }
    })

    return NextResponse.json(organizations)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/organizations/user/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
