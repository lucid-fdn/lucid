import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  return retiredOrgTemplateCatalogResponse()
}

export async function POST(): Promise<NextResponse> {
  return retiredOrgTemplateCatalogResponse()
}

function retiredOrgTemplateCatalogResponse(): NextResponse {
  return NextResponse.json({
    error: 'Org template catalog authoring has been retired. Create or update Lucid Pack templates through /api/agent-ops/packs.',
  }, { status: 410 })
}
