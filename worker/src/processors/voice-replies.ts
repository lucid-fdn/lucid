import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Config } from '../config.js'
import { synthesizeSpeech } from '../ai/media-gateway.js'
import { getWorkerMediaProviderConfig } from '../ai/media-provider-config.js'

export async function synthesizeVoiceReply(params: {
  config: Config
  text: string
  voice?: string
  instructions?: string
  fileBaseName: string
}) {
  return synthesizeSpeech({
    text: params.text,
    gatewayEndpoints: getWorkerMediaProviderConfig(params.config).gatewayEndpoints,
    ...(params.voice ? { voice: params.voice } : {}),
    ...(params.instructions ? { instructions: params.instructions } : {}),
    format: 'opus',
    fileBaseName: params.fileBaseName,
  })
}

export async function prepareVoiceReplyMedia(params: {
  config: Config
  text: string
  voice?: string
  instructions?: string
  fileBaseName: string
  tempDirName: string
}): Promise<{
  buffer: Buffer
  mimeType: string
  fileName: string
  filePath: string
  localRoot: string
  mediaUrl: string
}> {
  const speech = await synthesizeVoiceReply({
    config: params.config,
    text: params.text,
    ...(params.voice ? { voice: params.voice } : {}),
    ...(params.instructions ? { instructions: params.instructions } : {}),
    fileBaseName: params.fileBaseName,
  })
  const tempVoice = await writeVoiceTempFile({
    buffer: speech.buffer,
    fileName: speech.fileName,
    tempDirName: params.tempDirName,
  })

  return {
    buffer: speech.buffer,
    mimeType: speech.mimeType,
    fileName: speech.fileName,
    filePath: tempVoice.filePath,
    localRoot: tempVoice.localRoot,
    mediaUrl: tempVoice.mediaUrl,
  }
}

export async function writeVoiceTempFile(params: {
  buffer: Buffer
  fileName: string
  tempDirName?: string
}): Promise<{ filePath: string; localRoot: string; mediaUrl: string }> {
  const localRoot = path.join(os.tmpdir(), params.tempDirName ?? 'lucid-voice-replies')
  await fs.mkdir(localRoot, { recursive: true })
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '-')
  const filePath = path.join(localRoot, `${crypto.randomUUID()}-${safeName}`)
  await fs.writeFile(filePath, params.buffer)
  return {
    filePath,
    localRoot,
    mediaUrl: `file://${filePath.replace(/\\/g, '/')}`,
  }
}

export async function cleanupVoiceTempFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return
  await fs.unlink(filePath).catch(() => {})
}
