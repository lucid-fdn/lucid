import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { createWhatsAppConnectToken, getAssistant, isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { FEATURES } from '@/lib/features'
import { getHostedWhatsAppConfig } from '@/lib/whatsapp/webhook'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!FEATURES.whatsappHosted) {
      return NextResponse.json(
        {
          error: 'WhatsApp hosted connect is disabled on this deployment',
          details:
            'Enable FEATURE_WHATSAPP_HOSTED and configure the WHATSAPP_HOSTED_* deployment variables to use Lucid’s shared WhatsApp number.',
        },
        { status: 501 },
      )
    }

    let hostedConfig
    try {
      hostedConfig = getHostedWhatsAppConfig()
    } catch {
      return NextResponse.json(
        {
          error: 'Hosted WhatsApp is not fully configured',
          details:
            'Set WHATSAPP_HOSTED_PHONE_NUMBER, WHATSAPP_HOSTED_PHONE_NUMBER_ID, WHATSAPP_HOSTED_ACCESS_TOKEN, WHATSAPP_HOSTED_APP_SECRET, and WHATSAPP_HOSTED_VERIFY_TOKEN before generating hosted connect links.',
        },
        { status: 503 },
      )
    }

    const token = await createWhatsAppConnectToken({
      assistantId: id,
      orgId: assistant.org_id,
      createdBy: userId,
      ttlMinutes: 15,
    })

    const connectText = `connect ${token}`
    const connectUrl = `https://wa.me/${encodeURIComponent(hostedConfig.phoneNumber)}?text=${encodeURIComponent(connectText)}`

    return NextResponse.json({
      connectUrl,
      token,
      phoneNumber: hostedConfig.phoneNumber,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/whatsapp-connect', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-whatsapp-connect' },
    })
    return NextResponse.json({ error: 'Failed to generate WhatsApp connect URL' }, { status: 500 })
  }
}
