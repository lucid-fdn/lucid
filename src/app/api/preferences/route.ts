import { NextRequest, NextResponse } from 'next/server'
import { updateUserPreferences } from '@/lib/db'
import { getUserId } from '@/lib/auth/server-utils'
import { withCSRF } from '@/lib/auth/csrf'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export const PATCH = withCSRF(async (req: NextRequest) => {
  try {
    // Get authenticated user
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await req.json()
    const { sidebar_collapsed, theme, language, compact_mode, show_onboarding } = body

    // Update preferences
    const preferences = await updateUserPreferences(userId, {
      sidebar_collapsed,
      theme,
      language,
      compact_mode,
      show_onboarding
    })

    return NextResponse.json(preferences)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/preferences/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    )
  }
})
