import { NextResponse } from 'next/server'
import { getAssistant, isUserOrgMember } from '@/lib/db'

export async function authorizeAgentCardRequest(userId: string, assistantId: string) {
  const assistant = await getAssistant(assistantId)
  if (!assistant) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const isMember = await isUserOrgMember(userId, assistant.org_id)
  if (!isMember) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { assistant }
}
