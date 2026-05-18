# Telegram Feature Parity with openclaw — Heavy Lifts Plan

**Date**: 2026-04-07
**Status**: Draft
**Context**: After shipping the multi-agent hosted bot (@LucidBot deep links) and
porting the 3 P3 bounded wins (plain-text chunking, reply threading, callback 64-byte
sanitizer), we still lag openclaw's Telegram adapter on 4 features. This plan triages
them, says which can be copied verbatim vs rewritten, and orders by user-visible impact.

## Ground rule: "copy verbatim" is the goal, not the default

openclaw's Telegram code lives in `extensions/telegram/` and assumes:
1. **grammy** as the Telegram client (we use raw `fetch` — intentionally, to avoid
   dragging a 300KB dep into the Vercel edge runtime for the webhook).
2. **Single-process agent loop** — the Telegram adapter holds a direct reference to
   the agent and streams tokens into `editMessageText` in-process.
3. **Local filesystem state** for drafts, rate limits, dedup.
4. **Same owner for bot token + agent execution** (no C1 relay split).

Our architecture is different in all 4 ways. So:
- **Pure string/byte functions** (chunking, escaping, sanitizing) → copy verbatim.
- **Anything touching grammy, fs, or the agent loop** → copy the *algorithm*, rewrite
  the *plumbing* to fit C1 relay + Next.js webhook + worker split.

## The 4 heavy lifts

### 1. Streaming progressive edits (HIGH impact, MEDIUM effort)

**What openclaw does**: During agent execution, it calls `editMessageText` on the
placeholder message every ~1s with the current partial completion. User sees text
materialize in real time instead of a 10-30s silent wait.

**Why we can't copy verbatim**: openclaw's implementation lives inside the grammy
bot event handler, holds a reference to the running agent turn, and edits the message
in-process. Our flow:
```
Webhook (Next.js edge) → assistant_inbound_events
  → Worker claims via claim_next_inbound_event
  → Runs agent loop (different process, possibly different host)
  → Outbound delivery (back on control plane via C1 relay)
```
There is no single process that holds both the Telegram bot token AND the streaming
token callback.

**What to copy**: The algorithm — debounced edit (≥1s between edits), final flush on
completion, 4096-char cap handling (reuse our new `splitTelegramMessage`), Telegram
rate-limit handling (429 → back off, don't crash).

**What to rewrite**:
- **Stream transport**: Worker publishes partial tokens to a Supabase Realtime channel
  `telegram_stream:{runId}`. Control plane webhook handler subscribes, buffers, debounces,
  edits the placeholder. (Or: worker hits a new `POST /api/runtimes/messages/stream-partial`
  endpoint that debounces server-side. Realtime is cleaner — no per-token HTTP chatter.)
- **Placeholder message**: C1 complete-inbound already creates an outbound message. For
  streaming, we need to send the placeholder *before* the agent runs — add a new
  `POST /api/runtimes/messages/reserve-outbound` that sends "…" to Telegram and returns
  `external_message_id`, which the worker then targets for edits.
- **Chunk crossings**: When the stream crosses 4000 chars, send a new message (not edit).
  Track `currentChunkId` per stream.

**Files to touch**:
- `worker/src/agent/OpenClawAgent.ts` — `onPartialReply` emits to Realtime
- `src/app/api/runtimes/messages/reserve-outbound/route.ts` — new endpoint
- `src/lib/telegram/streaming-editor.ts` — new module (debounce + chunk-crossing logic)
- `src/app/api/webhooks/telegram/hosted/route.ts` — subscribe to stream channel

**Feature flag**: `FEATURE_TELEGRAM_STREAMING` (default off). Dedicated-runtime-only
at first — shared worker has too many channels to bolt streaming onto.

**Open question**: Does Telegram rate-limit `editMessageText` more aggressively than
`sendMessage`? If yes (and it does — ~1/sec per chat), our 1s debounce is the floor.

---

### 2. HTML chunking with entity awareness (LOW impact, HIGH effort)

**What openclaw does**: `splitTelegramHtmlChunks` in `extensions/telegram/src/format.ts`
— splits messages while respecting HTML entity boundaries (`<b>`, `<code>`, etc.),
re-opens tags across chunks, uses `renderMarkdownIRChunksWithinLimit` from
`openclaw/plugin-sdk/text-runtime`.

**Why we can't copy verbatim**: The function is the tip of an iceberg. It depends on
the entire markdown-to-IR pipeline (~2000 LOC across `text-runtime/ir/*`, `text-runtime/markdown/*`).
Copying it in would force us to maintain that IR pipeline on upstream sync.

**Why it's LOW impact**: We send `parse_mode: 'Markdown'` (the legacy v1 parser). Our
new `splitTelegramMessage` splits on plain-text boundaries (paragraph → newline → sentence
→ space → hard). The only failure mode is mid-entity splits that break rendering — e.g.,
splitting `**bold text**` across chunks produces literal `**bold` in chunk 1 and `text**`
in chunk 2, which Telegram's v1 parser renders as `*bold` + `text*` (legible, ugly).
Markdown v1 parser is *forgiving* — unlike MarkdownV2 or HTML, unmatched entities don't
throw, they just render as text.

**Decision**: **Don't port this.** Instead:
- Add a smoke test that splits `**bold paragraph**\n\n**more bold**` at a 10-char limit
  and asserts no chunk has an odd number of `**`. If we ever see ugly splits in production,
  write a 30-LOC entity-aware splitter (track open `**`/`_`/`` ` `` counts, rewind to
  the last balanced position). Do NOT import openclaw's IR pipeline.

**Revisit if**: We switch to `parse_mode: 'MarkdownV2'` or `parse_mode: 'HTML'`. Those
parsers throw on unmatched entities and will fail delivery silently.

---

### 3. Inbound media — photos, voice, documents (HIGH impact, MEDIUM effort)

**What openclaw does**: When a user sends a photo/voice/doc, openclaw downloads it via
`getFile` + `https://api.telegram.org/file/bot{token}/{file_path}`, runs it through
vision (for photos) or transcription (for voice), and feeds the result into the agent.

**Why it's HIGH impact**: We currently drop all non-text messages silently. On a shared
@LucidBot where users paste screenshots ("look at this error"), this is the #1 complaint
pattern to expect.

**What copies verbatim** (~15 LOC):
```typescript
// src/lib/telegram/file-download.ts
async function downloadTelegramFile(
  botToken: string,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
  const getFileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
  const { result } = await getFileRes.json() as { result: { file_path: string; file_size: number } }
  const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${result.file_path}`)
  const buffer = Buffer.from(await fileRes.arrayBuffer())
  const mimeType = fileRes.headers.get('content-type') ?? 'application/octet-stream'
  return { buffer, mimeType, size: result.file_size }
}
```

**What's ours** (not in openclaw):
- **Storage**: Supabase Storage bucket `telegram-media` (private, signed URLs).
- **Encryption**: If `ENCRYPTION_KEY` set, AES-GCM the buffer before upload.
- **Size cap**: 20MB (Telegram's `getFile` cap). Reject larger with a reply.
- **Inbound event shape**: Extend `assistant_inbound_events.metadata` with
  `attachments: [{ kind: 'image'|'voice'|'doc', storage_url, mime, size }]`.
- **Agent hand-off**: Inbound processor includes attachments in the user message. For
  vision models (already used by web_fetch image analysis), pass image URLs directly.
  For voice, transcribe via TrustGate's Whisper-equivalent (if available) before handoff.

**Files**:
- `src/lib/telegram/file-download.ts` — new
- `src/app/api/webhooks/telegram/hosted/route.ts` — extract `message.photo`, `voice`, `document`
- `src/lib/db/channels.ts` — extend inbound event creation with attachments field
- `worker/src/processors/inbound.ts` — render attachments in user message

**Feature flag**: None — this is pure additive. Voice can ship later if Whisper isn't
wired.

**Staging**:
1. **Chunk A**: Photos only (vision-ready models handle URLs).
2. **Chunk B**: Documents (PDF → reuse existing pdf tool's handling).
3. **Chunk C**: Voice (requires transcription — gated on STT provider choice).

---

### 4. sendChatAction typing indicator (LOW impact, TINY effort)

**What openclaw does**: Calls `sendChatAction(chatId, 'typing')` before long operations.
Telegram shows "Assistant is typing…" for up to 5s. Re-send every 4s if operation longer.

**Copies verbatim** (~10 LOC):
```typescript
async function sendChatAction(botToken: string, chatId: string, action: 'typing' = 'typing') {
  await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  })
}
```

**Wire point**: Control plane webhook handler calls it right after queuing the inbound
event (before returning 200 to Telegram). That's a single "I got your message" cue.
For long-running turns (>5s), worker would need to re-ping via Realtime or a dedicated
endpoint — but the first cue is 90% of the perceived-latency win.

**Ship with**: Streaming (#1) — they share the placeholder-message lifecycle. Or
standalone as a 1-hour task.

---

## Triage & ordering

| # | Feature | Impact | Effort | Ship order | Blocker? |
|---|---------|--------|--------|------------|----------|
| 3 | Inbound media (photos) | HIGH | 1-2 days | **First** | No — pure additive |
| 4 | Typing indicator | LOW | 1 hour | With #3 or #1 | No |
| 1 | Streaming progressive edits | HIGH | 3-5 days | Second | Realtime channel design |
| 3b| Inbound voice | MEDIUM | 2 days | After #1 | STT provider |
| 2 | HTML entity chunking | LOW | 3-4 days | **Skip** | Only if switching to MarkdownV2 |

## Non-goals

- **Don't** copy `extensions/telegram/` wholesale. It drags grammy (~300KB), `text-runtime`
  (~2000 LOC IR pipeline), and file state assumptions that conflict with C1 relay.
- **Don't** port openclaw's draft transport. Our DB-backed `assistant_outbound_events`
  already has the features drafts give openclaw (retry, idempotency, status tracking).
- **Don't** add MarkdownV2 support just because openclaw uses it. Markdown v1 is
  forgiving on unmatched entities; v2 throws. We'd need entity-aware chunking to ship v2,
  and the visible win is tiny (underline, spoiler, quoted block).

## What this plan commits to

1. **Ship Chunk A (photos) + typing indicator** within 1 sprint.
2. **Ship streaming** gated behind `FEATURE_TELEGRAM_STREAMING`, dedicated-runtime-only,
   in the next sprint. Realtime channel design reviewed before starting.
3. **Defer voice** until we pick an STT provider (Whisper via TrustGate, or direct OpenAI).
4. **Defer HTML chunking indefinitely**. Revisit only if we switch parse_mode.

## Risks

- **Telegram rate limits**: `sendMessage` is ~30/sec/chat, `editMessageText` is ~1/sec/chat.
  Streaming must respect the edit floor — a buggy implementation gets the bot throttled
  for the whole org. Hard 1s debounce + 429 backoff is non-negotiable.
- **Realtime channel scalability**: `telegram_stream:{runId}` channels are short-lived
  (< 30s each). Supabase Realtime can handle ~500 concurrent channels per project on
  the Pro plan. If we ever have 1000+ concurrent streaming turns, we move to a single
  broadcast channel filtered by runId.
- **Media storage cost**: Telegram users paste large screenshots. 20MB cap + 7-day TTL
  on the bucket keeps cost bounded. Needs a cleanup cron.
