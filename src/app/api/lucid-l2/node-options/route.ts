/**
 * Node Options API Route
 * 
 * Loads dynamic options for node parameters that depend on other parameters.
 * For example, loading "Table" options based on selected "Base".
 * 
 * This proxies to the n8n API's loadOptions methods.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getLucidL2Client } from '@/lib/lucid-l2/client'
import { ErrorService } from '@/lib/errors/error-service'
import { getServerAuth } from '@/lib/auth/server-utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const nodeOptionsRequestSchema = z.object({
  nodeName: z.string().min(1),
  nodeVersion: z.number().optional(),
  parameterName: z.string().min(1),
  loadOptionsMethod: z.string().min(1).optional(),
  currentValues: z.record(z.string(), z.unknown()).optional(),
})

/**
 * POST /api/lucid-l2/node-options
 * 
 * Body:
 * - nodeName: string (e.g., "n8n-nodes-base.airtable")
 * - nodeVersion: number (e.g., 2.1)
 * - parameterName: string (e.g., "table")
 * - loadOptionsMethod: string (e.g., "getTableNames")
 * - currentValues: object (current parameter values)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getServerAuth()
    if (!auth.isAuthenticated || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsedBody = nodeOptionsRequestSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsedBody.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { nodeName, nodeVersion, parameterName, loadOptionsMethod, currentValues } = parsedBody.data

    const client = getLucidL2Client()

    // Call n8n API to load options
    // Note: The actual API endpoint depends on n8n's implementation
    // This is a simplified version - you may need to adjust based on your n8n setup
    const options = await client.loadNodeOptions({
      nodeName,
      nodeVersion,
      method: loadOptionsMethod || parameterName,
      currentValues: currentValues || {},
    })

    return NextResponse.json({
      success: true,
      options: options || []
    })
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/lucid-l2/node-options/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to load options',
        success: false,
        options: []
      },
      { status: 500 }
    )
  }
}
