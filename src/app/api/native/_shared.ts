import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { ErrorService } from '@/lib/errors/error-service'

export function nativeApiError(error: unknown, operation: string) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid native payload', issues: error.issues }, { status: 400 })
  }

  if (error instanceof Error && error.name === 'AuthenticationError') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (error instanceof Error && /not found/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  if (error instanceof Error && /invalid native refresh token/i.test(error.message)) {
    return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 })
  }

  ErrorService.captureException(error, {
    severity: 'error',
    context: { operation },
    tags: { layer: 'api', route: 'native-control-plane' },
  })
  return NextResponse.json({ error: 'Failed to process native request' }, { status: 500 })
}

