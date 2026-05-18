import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { listKeyTemplates, createKeyTemplate, deleteKeyTemplate } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/orgs/[id]/lucidgateway-keys/templates
 * List all key templates for an organization
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const _userId = await requireUserId()
    const { id: orgId } = await params

    if (!orgId) {
      return NextResponse.json({ error: 'Missing org ID' }, { status: 400 })
    }

    const templates = await listKeyTemplates(orgId)
    return NextResponse.json({ templates })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  }
}

/**
 * POST /api/orgs/[id]/lucidgateway-keys/templates
 * Create a new key template
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId()
    const { id: orgId } = await params
    const body = await request.json()

    if (!orgId) {
      return NextResponse.json({ error: 'Missing org ID' }, { status: 400 })
    }

    if (!body.templateName) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 })
    }

    const template = await createKeyTemplate({
      orgId,
      templateName: body.templateName,
      description: body.description || undefined,
      config: body.config || {},
      createdBy: userId,
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message.includes('duplicate')) {
      return NextResponse.json({ error: 'A template with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}

/**
 * DELETE /api/orgs/[id]/lucidgateway-keys/templates?templateId=xxx
 * Delete a key template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const _userId = await requireUserId()
    const { id: orgId } = await params
    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('templateId')

    if (!orgId || !templateId) {
      return NextResponse.json({ error: 'Missing org ID or template ID' }, { status: 400 })
    }

    await deleteKeyTemplate(templateId)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}