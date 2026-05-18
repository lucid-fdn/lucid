/**
 * OAuth Node Detection API Route
 * 
 * Server-side endpoint for detecting OAuth-enabled nodes.
 * This separates server-only imports from client-side code.
 */

import { NextRequest, NextResponse } from 'next/server'
import { 
  getOAuthEnabledNodes,
  nodeRequiresOAuth,
  getNodeOAuthProvider,
  getAllOAuthProviders,
  getOAuthStats
} from '@/lib/oauth/node-detection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/oauth/node-detection
 * 
 * Query params:
 * - action: 'all' | 'check' | 'provider' | 'providers' | 'stats'
 * - nodeType: string (for 'check' and 'provider' actions)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action') || 'all'
    const nodeType = searchParams.get('nodeType')

    switch (action) {
      case 'all': {
        // Get all OAuth-enabled nodes
        const nodes = await getOAuthEnabledNodes()
        return NextResponse.json({ nodes }, { status: 200 })
      }

      case 'check': {
        // Check if specific node requires OAuth
        if (!nodeType) {
          return NextResponse.json(
            { error: 'nodeType parameter required' },
            { status: 400 }
          )
        }

        const requiresOAuth = await nodeRequiresOAuth(nodeType)
        return NextResponse.json({ requiresOAuth, nodeType }, { status: 200 })
      }

      case 'provider': {
        // Get OAuth provider for specific node
        if (!nodeType) {
          return NextResponse.json(
            { error: 'nodeType parameter required' },
            { status: 400 }
          )
        }

        const provider = await getNodeOAuthProvider(nodeType)
        return NextResponse.json({ provider, nodeType }, { status: 200 })
      }

      case 'providers': {
        // Get all unique OAuth providers
        const providers = await getAllOAuthProviders()
        return NextResponse.json({ providers }, { status: 200 })
      }

      case 'stats': {
        // Get OAuth statistics
        const stats = await getOAuthStats()
        return NextResponse.json({ stats }, { status: 200 })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[OAuth Node Detection API] Error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to detect OAuth nodes',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
