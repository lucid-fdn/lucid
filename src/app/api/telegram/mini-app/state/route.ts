import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import {
  getOrganizationById,
  getProfile,
  getTelegramVoiceSettingsForChat,
  listTelegramChannelsForChat,
  listTelegramWorkspacesForChat,
} from '@/lib/db'
import { verifyTelegramMiniAppInitData } from '@/lib/telegram/mini-app'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_HOSTED_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ ok: false, error: 'Bot is unavailable.' }, { status: 503 })
  }

  const body = (await request.json().catch(() => null)) as { initData?: string } | null
  const initData = body?.initData?.trim()
  if (!initData) {
    return NextResponse.json({ ok: false, error: 'Missing Mini App session.' }, { status: 400 })
  }

  const context = verifyTelegramMiniAppInitData(initData, botToken)
  if (!context) {
    return NextResponse.json({ ok: false, error: 'Mini App session is invalid.' }, { status: 401 })
  }

  const [channels, workspaces, voiceSettings] = await Promise.all([
    listTelegramChannelsForChat(context.chatId),
    listTelegramWorkspacesForChat(context.chatId),
    getTelegramVoiceSettingsForChat(context.chatId),
  ])

  const active = channels.find((channel) => channel.is_primary) ?? channels[0] ?? null
  const currentWorkspace = workspaces.find((workspace) => workspace.is_current) ?? workspaces[0] ?? null
  const [org, profile] = await Promise.all([
    currentWorkspace?.org_id ? getOrganizationById(currentWorkspace.org_id) : Promise.resolve(null),
    getProfile(context.userId),
  ])

  const isPersonalWorkspace = org?.type === 'personal'
  const headerName = isPersonalWorkspace
    ? (profile?.name || profile?.handle || 'Personal workspace')
    : (org?.display_name || org?.name || currentWorkspace?.org_name || 'Workspace')
  const headerImageUrl = isPersonalWorkspace
    ? (profile?.avatar_url || null)
    : (org?.logo_url || null)

  return NextResponse.json({
    ok: true,
    state: {
      userId: context.userId,
      header: {
        name: headerName,
        imageUrl: headerImageUrl,
        isPersonal: isPersonalWorkspace,
      },
      activeAgent: active
        ? {
            id: active.assistant_id,
            name: active.assistant_name,
            roleTitle: active.assistant_role_title,
            essence: active.assistant_essence,
          }
        : null,
      agents: channels.map((channel) => ({
        id: channel.assistant_id,
        name: channel.assistant_name,
        roleTitle: channel.assistant_role_title,
        orgId: channel.org_id ?? null,
        isActive: channel.is_primary,
      })),
      workspace: currentWorkspace,
      workspaces,
      workspaceCount: workspaces.length,
      agentCount: channels.length,
      voiceSettings: voiceSettings
        ? {
            mode: voiceSettings.mode,
            voiceId: voiceSettings.voiceId,
            instructions: voiceSettings.instructions,
          }
        : null,
    },
  })
}
