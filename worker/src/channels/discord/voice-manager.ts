import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import prism from 'prism-media'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AudioPlayerStatus,
  EndBehaviorType,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection,
} from '@discordjs/voice'
import type { Config } from '../../config.js'
import type { DiscordGatewayManager } from './DiscordGatewayManager.js'
import { transcribeAudio } from '../bridge/media/audio-transcription.js'
import { prepareVoiceReplyMedia, cleanupVoiceTempFile } from '../../processors/voice-replies.js'

const SAMPLE_RATE = 48_000
const CHANNELS = 2
const BIT_DEPTH = 16
const PLAYBACK_READY_TIMEOUT_MS = 15_000
const SILENCE_DURATION_MS = 1_200
const MIN_SEGMENT_SECONDS = 0.45

type VoiceSessionEntry = {
  guildId: string
  channelId: string
  bindingChannelId: string
  assistantId: string
  orgId: string | null
  connection: VoiceConnection
  player: AudioPlayer
  playbackQueue: Promise<void>
  processingQueue: Promise<void>
  activeSpeakers: Set<string>
  stop: () => void
}

function buildWavBuffer(pcm: Buffer): Buffer {
  const blockAlign = (CHANNELS * BIT_DEPTH) / 8
  const byteRate = SAMPLE_RATE * blockAlign
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(BIT_DEPTH, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

function estimateDurationSeconds(pcm: Buffer): number {
  const bytesPerSample = (BIT_DEPTH / 8) * CHANNELS
  return bytesPerSample > 0 ? pcm.length / (bytesPerSample * SAMPLE_RATE) : 0
}

async function decodeVoiceStream(
  stream: NodeJS.ReadableStream,
): Promise<{ pcm: Buffer; durationSeconds: number }> {
  const decoder = new prism.opus.Decoder({
    rate: SAMPLE_RATE,
    channels: CHANNELS,
    frameSize: 960,
  })

  const chunks: Buffer[] = []
  const finished = new Promise<void>((resolve, reject) => {
    decoder.on('data', (chunk: Buffer) => {
      if (chunk.length > 0) chunks.push(Buffer.from(chunk))
    })
    decoder.once('error', reject)
    decoder.once('end', () => resolve())
    stream.once('error', reject)
  })

  stream.pipe(decoder)
  await finished

  const pcm = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0)
  return {
    pcm,
    durationSeconds: estimateDurationSeconds(pcm),
  }
}

async function writeTempWav(params: { pcm: Buffer; guildId: string; channelId: string }) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'lucid-discord-vc-'))
  const wavPath = path.join(
    root,
    `${params.guildId}-${params.channelId}-${crypto.randomUUID()}.wav`,
  )
  await fsp.writeFile(wavPath, buildWavBuffer(params.pcm))
  return {
    root,
    wavPath,
  }
}

export class DiscordHostedVoiceManager {
  private readonly sessions = new Map<string, VoiceSessionEntry>()

  constructor(
    private readonly params: {
      supabase: SupabaseClient
      config: Config
      gatewayManager: DiscordGatewayManager
      onInboundQueued?: (event: {
        id: string
        assistant_id: string
        org_id?: string
        external_message_id?: string | null
      }) => Promise<void> | void
    },
  ) {}

  status(): Array<{
    guildId: string
    channelId: string
    assistantId: string
    connected: boolean
  }> {
    return Array.from(this.sessions.values()).map((entry) => ({
      guildId: entry.guildId,
      channelId: entry.channelId,
      assistantId: entry.assistantId,
      connected: entry.connection.state.status === VoiceConnectionStatus.Ready,
    }))
  }

  async join(params: { guildId: string; channelId: string }) {
    const guildId = params.guildId.trim()
    const channelId = params.channelId.trim()
    if (!guildId || !channelId) {
      return { ok: false, message: 'Missing guildId or channelId.' }
    }

    const binding = this.params.gatewayManager.resolveGuildBinding(guildId)
    if (!binding) {
      return { ok: false, message: 'No active hosted Discord agent is bound to this server.' }
    }

    const adapterCreator = this.params.gatewayManager.createVoiceAdapter(guildId)
    if (!adapterCreator) {
      return { ok: false, message: 'Hosted Discord voice adapter is unavailable for this guild.' }
    }

    const existing = this.sessions.get(guildId)
    if (existing?.channelId === channelId) {
      return { ok: true, message: `Already connected to voice channel ${channelId}.` }
    }
    if (existing) {
      await this.leave({ guildId })
    }

    const connection = joinVoiceChannel({
      guildId,
      channelId,
      adapterCreator,
      selfDeaf: false,
      selfMute: false,
    })

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, PLAYBACK_READY_TIMEOUT_MS)
    } catch (error) {
      connection.destroy()
      return {
        ok: false,
        message: `Failed to join voice channel: ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    const player = createAudioPlayer()
    connection.subscribe(player)

    const entry: VoiceSessionEntry = {
      guildId,
      channelId,
      bindingChannelId: binding.internalChannelId,
      assistantId: binding.assistantId,
      orgId: binding.orgId,
      connection,
      player,
      playbackQueue: Promise.resolve(),
      processingQueue: Promise.resolve(),
      activeSpeakers: new Set(),
      stop: () => {
        connection.receiver.speaking.off('start', speakingHandler)
        player.stop()
        connection.destroy()
      },
    }

    const speakingHandler = (userId: string) => {
      void this.handleSpeakingStart(entry, userId)
    }

    connection.receiver.speaking.on('start', speakingHandler)
    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (this.sessions.get(guildId)?.connection === connection) {
        this.sessions.delete(guildId)
      }
    })

    this.sessions.set(guildId, entry)
    return { ok: true, message: `Joined voice channel ${channelId}.` }
  }

  async leave(params: { guildId: string }) {
    const guildId = params.guildId.trim()
    const entry = this.sessions.get(guildId)
    if (!entry) {
      return { ok: false, message: 'Not connected to a hosted voice session in this guild.' }
    }
    entry.stop()
    this.sessions.delete(guildId)
    return { ok: true, message: `Left voice channel ${entry.channelId}.` }
  }

  async destroy(): Promise<void> {
    for (const entry of this.sessions.values()) {
      entry.stop()
    }
    this.sessions.clear()
  }

  async playAssistantReply(params: {
    guildId: string
    channelId: string
    text: string
    voiceId?: string | null
    instructions?: string | null
  }): Promise<void> {
    const entry = this.sessions.get(params.guildId)
    if (!entry || entry.channelId !== params.channelId) {
      throw new Error('Hosted Discord voice session is not active for this guild/channel.')
    }

    const text = params.text.trim()
    if (!text) return

    entry.playbackQueue = entry.playbackQueue.then(async () => {
      const voiceMedia = await prepareVoiceReplyMedia({
        config: this.params.config,
        text,
        voice: params.voiceId ?? undefined,
        instructions: params.instructions ?? undefined,
        fileBaseName: 'discord-voice-reply',
        tempDirName: 'lucid-discord-vc-replies',
      })

      try {
        const resource = createAudioResource(fs.createReadStream(voiceMedia.filePath), {
          inputType: StreamType.OggOpus,
          metadata: { guildId: params.guildId, channelId: params.channelId },
        })
        entry.player.play(resource)
        await new Promise<void>((resolve, reject) => {
          const onIdle = () => {
            cleanup()
            resolve()
          }
          const onError = (error: Error) => {
            cleanup()
            reject(error)
          }
          const cleanup = () => {
            entry.player.off(AudioPlayerStatus.Idle, onIdle)
            entry.player.off('error', onError)
          }
          entry.player.once(AudioPlayerStatus.Idle, onIdle)
          entry.player.once('error', onError)
        })
      } finally {
        await cleanupVoiceTempFile(voiceMedia.filePath)
      }
    })

    await entry.playbackQueue
  }

  private async handleSpeakingStart(entry: VoiceSessionEntry, userId: string): Promise<void> {
    if (!userId || entry.activeSpeakers.has(userId)) return
    const botUserId = this.params.gatewayManager.getBotUserIdForGuild(entry.guildId)
    if (botUserId && userId === botUserId) return

    entry.activeSpeakers.add(userId)
    const receiveStream = entry.connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: SILENCE_DURATION_MS,
      },
    })

    try {
      const { pcm, durationSeconds } = await decodeVoiceStream(receiveStream)
      if (!pcm.length || durationSeconds < MIN_SEGMENT_SECONDS) {
        return
      }

      entry.processingQueue = entry.processingQueue.then(async () => {
        await this.processSegment({
          entry,
          userId,
          pcm,
        })
      })
      await entry.processingQueue
    } catch (error) {
      console.warn('[discord-voice] capture failed:', error instanceof Error ? error.message : error)
    } finally {
      entry.activeSpeakers.delete(userId)
    }
  }

  private async processSegment(params: {
    entry: VoiceSessionEntry
    userId: string
    pcm: Buffer
  }): Promise<void> {
    const { root, wavPath } = await writeTempWav({
      pcm: params.pcm,
      guildId: params.entry.guildId,
      channelId: params.entry.channelId,
    })

    try {
      const buffer = await fsp.readFile(wavPath)
      const transcript = (await transcribeAudio({
        buffer,
        mimeType: 'audio/wav',
        fileName: 'discord-voice.wav',
        gatewayBaseUrls: this.params.config.LUCID_API_BASE_URL ? [this.params.config.LUCID_API_BASE_URL] : [],
        gatewayApiKeys: this.params.config.LUCID_API_KEY ? [this.params.config.LUCID_API_KEY] : [],
      })).trim()

      if (!transcript) return

      const inboundEventId = crypto.randomUUID()
      const externalMessageId = `discord-voice:${params.entry.guildId}:${Date.now()}`
      const eventPayload = {
        id: inboundEventId,
        channel_id: params.entry.bindingChannelId,
        assistant_id: params.entry.assistantId,
        external_message_id: externalMessageId,
        external_user_id: params.userId,
        external_chat_id: `voice:${params.entry.channelId}`,
        message_text: transcript,
        message_data: {
          channel_type: 'discord',
          guild_id: params.entry.guildId,
          discord_guild_id: params.entry.guildId,
          discord_channel_id: params.entry.channelId,
          discord_binding_scope: 'guild',
          discord_audio_input: true,
          discord_voice_session: {
            guildId: params.entry.guildId,
            channelId: params.entry.channelId,
            transport: 'voice_channel',
          },
          discord_attachments: [],
        },
        status: 'pending',
      }

      const { data, error } = await this.params.supabase
        .from('assistant_inbound_events')
        .insert(eventPayload)
        .select('id, assistant_id, external_message_id')
        .single()

      if (error || !data) {
        throw new Error(error?.message ?? 'Failed to enqueue discord voice inbound event')
      }

      if (this.params.onInboundQueued) {
        await this.params.onInboundQueued({
          id: data.id,
          assistant_id: data.assistant_id,
          external_message_id: data.external_message_id,
          org_id: params.entry.orgId ?? undefined,
        })
      }
    } finally {
      await fsp.rm(root, { recursive: true, force: true }).catch(() => {})
    }
  }
}
