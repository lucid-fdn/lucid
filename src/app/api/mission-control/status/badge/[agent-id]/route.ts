import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/status/badge/[agent-id]
// Public endpoint — returns SVG badge showing agent status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ 'agent-id': string }> }
) {
  const { 'agent-id': agentId } = await params

  // Check if status page is enabled for this agent
  const { data: statusPage } = await supabase
    .from('mc_status_pages')
    .select('enabled')
    .eq('agent_id', agentId)
    .eq('enabled', true)
    .maybeSingle()

  if (!statusPage) {
    return new NextResponse(generateBadgeSVG('unknown', '#999'), {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=60',
      },
    })
  }

  // Check for active incidents
  const { count: activeIncidents } = await supabase
    .from('mc_incidents')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .neq('status', 'resolved')

  const status = activeIncidents && activeIncidents > 0 ? 'degraded' : 'operational'
  const color = status === 'operational' ? '#22c55e' : '#eab308'

  return new NextResponse(generateBadgeSVG(status, color), {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=60',
    },
  })
}

function generateBadgeSVG(status: string, color: string): string {
  const labelWidth = 50
  const statusWidth = status.length * 7 + 12
  const totalWidth = labelWidth + statusWidth

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img">
  <title>Status: ${status}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${statusWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">status</text>
    <text x="${labelWidth / 2}" y="14">status</text>
    <text x="${labelWidth + statusWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${status}</text>
    <text x="${labelWidth + statusWidth / 2}" y="14">${status}</text>
  </g>
</svg>`
}
