export function mergeTelegramPlatformOptions(
  base: Record<string, unknown> | undefined,
  extra: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base) return extra
  if (!extra) return base
  return { ...base, ...extra }
}

export function extractTelegramPhotoPayload(text: string): { photoUrl: string; caption?: string } | null {
  const markdownImage = text.match(/!\[[^\]]*]\((https?:\/\/[^\s)]+?\.(?:png|jpe?g|gif|webp))(?:\?[^\s)]*)?\)/i)
  if (markdownImage) {
    const photoUrl = markdownImage[1]
    const caption = text.replace(markdownImage[0], '').trim()
    return { photoUrl, ...(caption ? { caption } : {}) }
  }

  const trimmed = text.trim()
  if (/^https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?$/i.test(trimmed)) {
    return { photoUrl: trimmed }
  }

  return null
}

export async function sendTelegramPhoto(params: {
  botToken: string
  chatId: string
  photoUrl: string
  caption?: string
  replyToId?: string
  platformOptions?: Record<string, unknown>
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${params.botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: params.chatId,
        photo: params.photoUrl,
        ...(params.caption ? { caption: params.caption } : {}),
        ...(params.replyToId ? { reply_to_message_id: Number.parseInt(params.replyToId, 10) } : {}),
        ...(params.platformOptions || {}),
      }),
    })
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; result?: { message_id?: number }; description?: string }
      | null
    if (!response.ok || payload?.ok === false) {
      return { ok: false, error: payload?.description ?? `HTTP ${response.status}` }
    }
    return {
      ok: true,
      messageId: payload?.result?.message_id ? String(payload.result.message_id) : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
