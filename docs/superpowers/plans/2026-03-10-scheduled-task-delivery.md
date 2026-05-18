# Scheduled Task Delivery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scheduled task output get delivered to the originating channel (Telegram, Discord, Slack, WhatsApp, web) — mirroring OpenClaw's cron delivery system.

**Architecture:** When an agent schedules a task via `schedule_task`, we store the originating `channel_id` alongside the task. When the worker executes the task, we capture the agent's response text and insert an `assistant_outbound_events` row targeting that channel. The existing outbound processor then delivers the message to the correct channel API. For web channels, the client polls for new messages.

**Tech Stack:** Supabase (PostgreSQL migration), TypeScript (worker)

---

## Chunk 1: Database + Scheduler Tool + Worker Delivery

### Task 1: Add `channel_id` column to `agent_scheduled_tasks`

**Files:**
- Create: `migrations/083_scheduled_task_channel_delivery.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 083: Add channel delivery to scheduled tasks
-- Stores originating channel_id so scheduled task output can be delivered back.

ALTER TABLE agent_scheduled_tasks
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES assistant_channels(id) ON DELETE SET NULL;

ALTER TABLE agent_scheduled_tasks
  ADD COLUMN IF NOT EXISTS last_run_output TEXT;

COMMENT ON COLUMN agent_scheduled_tasks.channel_id IS 'Originating channel for delivery. NULL = no delivery (fire-and-forget).';
COMMENT ON COLUMN agent_scheduled_tasks.last_run_output IS 'Last agent response text. Stored for debugging and web channel polling.';
```

- [ ] **Step 2: Apply migration locally**

Run: `psql` or Supabase dashboard to run the migration against your dev DB.

- [ ] **Step 3: Commit**

```bash
git add migrations/083_scheduled_task_channel_delivery.sql
git commit -m "feat: add channel_id and last_run_output to agent_scheduled_tasks"
```

---

### Task 2: Pass `channel_id` through scheduler context

The `schedule_task` tool needs to know which channel the agent is currently running in, so it can store it in the task row.

**Files:**
- Modify: `worker/src/agent/runtime-tools/scheduler.ts` — add `channelId` to `SchedulerContext`, store in insert
- Modify: `worker/src/agent/BuiltInToolExecutor.ts` — pass `channelId` through from params
- Modify: `worker/src/agent/BuiltInToolExecutor.ts` — add `channelId` to `BuiltInToolExecutorParams`
- Modify: `worker/src/agent/OpenClawAgent.ts` — pass `channelId` from `OpenClawAgentParams` to executor
- Modify: `worker/src/processors/inbound.ts` — pass `channel_id` from event into agent params

- [ ] **Step 1: Add `channelId` to `SchedulerContext` and store it**

In `worker/src/agent/runtime-tools/scheduler.ts`, add `channelId?: string` to the `SchedulerContext` interface and include it in the insert:

```typescript
// In SchedulerContext interface, add:
channelId?: string

// In toolScheduleTask, add to the insert object:
channel_id: ctx.channelId || null,
```

- [ ] **Step 2: Add `channelId` to `BuiltInToolExecutorParams`**

In `worker/src/agent/BuiltInToolExecutor.ts`:

```typescript
// In BuiltInToolExecutorParams interface, add:
/** Originating channel ID — passed to scheduler for delivery routing */
channelId?: string
```

And in the `schedule_task` case, pass it through:

```typescript
case 'schedule_task':
  return toolScheduleTask(
    args as unknown as Parameters<typeof toolScheduleTask>[0],
    {
      supabase: params.supabase,
      assistantId: params.assistant.id,
      orgId: params.assistant.org_id ?? '',
      conversationId: params.conversationId,
      parentRunId: params.runId,
      toolCallId,
      channelId: params.channelId,  // ADD THIS
    },
  )
```

- [ ] **Step 3: Thread `channelId` through `OpenClawAgent`**

In `worker/src/agent/OpenClawAgent.ts`, find `OpenClawAgentParams` and add `channelId?: string`. Then pass it to the `BuiltInToolExecutor` params when constructing them. Look for where `BuiltInToolExecutorParams` is built and add `channelId: params.channelId`.

- [ ] **Step 4: Pass `channel_id` from inbound event into agent call**

In `worker/src/processors/inbound.ts`, find where `runOpenClawAgent` is called (around line 461). The `event.channel_id` is available. Add `channelId: event.channel_id` to the params object.

- [ ] **Step 5: Commit**

```bash
git add worker/src/agent/runtime-tools/scheduler.ts worker/src/agent/BuiltInToolExecutor.ts worker/src/agent/OpenClawAgent.ts worker/src/processors/inbound.ts
git commit -m "feat: thread channel_id through scheduler context for delivery routing"
```

---

### Task 3: Deliver scheduled task output via outbound events

This is the core fix. After `runOpenClawAgent` completes in `processScheduledTask`, capture the response and create an outbound event.

**Files:**
- Modify: `worker/src/index.ts` — update `processScheduledTask` to capture result, store output, create outbound event

- [ ] **Step 1: Capture agent result and deliver**

In `worker/src/index.ts`, the `processScheduledTask` function (around line 274). The current code calls `await runOpenClawAgent(...)` without capturing the return value. Change it to:

```typescript
async function processScheduledTask(task: {
  id: string
  assistant_id: string
  org_id: string
  task_prompt: string
  cron_expression: string | null
  timezone: string
  max_retries: number
  retry_count: number
  run_count: number
  channel_id: string | null        // ADD THIS
  conversation_id: string | null   // ADD THIS
}): Promise<void> {
```

Then inside the function, capture the result:

```typescript
  // Change: await runOpenClawAgent({...})
  // To:
  const result = await runOpenClawAgent({
    // ... existing params stay the same
  })

  // --- NEW: Deliver output to originating channel ---
  const responseText = result.text?.trim()

  // Store last_run_output for debugging / web polling
  if (responseText) {
    await supabase.from('agent_scheduled_tasks').update({
      last_run_output: responseText,
    }).eq('id', task.id)
  }

  // Deliver to originating channel (if one was stored)
  if (responseText && task.channel_id) {
    await supabase.from('assistant_outbound_events').insert({
      channel_id: task.channel_id,
      conversation_id: task.conversation_id || null,
      message_text: `[Scheduled: ${task.name || 'task'}]\n${responseText}`,
      reply_to_external_id: null,
    })
    console.log(`[scheduler] Delivered task ${task.id} output to channel ${task.channel_id}`)
  }
```

- [ ] **Step 2: Update the task fields in `pollScheduledTasks`**

In `pollScheduledTasks`, the `claim_next_scheduled_task` RPC returns full rows. The `processScheduledTask` call already receives the task object. Verify that `channel_id` and `conversation_id` are included in the destructured/typed task object passed to `processScheduledTask`. The RPC returns `SETOF agent_scheduled_tasks` so these columns will be present automatically after migration.

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat: deliver scheduled task output to originating channel via outbound events"
```

---

### Task 4: Handle web channel — store output for browser polling

For web channels, the outbound processor just stamps `web-{timestamp}` as the external ID (line 162 of outbound.ts). The browser needs to poll for new messages. The output is already stored in `last_run_output` and the outbound event is created, so the web channel path in `processOutboundEvent` already handles this (it sets `externalMessageId = 'web-${Date.now()}'` and marks sent).

However, we also need to store the assistant message in `assistant_messages` so the chat UI shows it when the user opens the conversation.

**Files:**
- Modify: `worker/src/index.ts` — add message insert before outbound event

- [ ] **Step 1: Insert assistant message for conversation continuity**

In `processScheduledTask`, after the `responseText` check and before the outbound event insert, add:

```typescript
  // Store in conversation messages so chat UI shows the response
  if (responseText && task.conversation_id) {
    const messageId = crypto.randomUUID()
    await supabase.from('assistant_messages').insert({
      id: messageId,
      conversation_id: task.conversation_id,
      role: 'assistant',
      content: responseText,
    })
  }
```

Make sure `crypto` is imported (it already is via `const crypto = await import('node:crypto')` in the function).

- [ ] **Step 2: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat: store scheduled task output in assistant_messages for chat continuity"
```

---

### Task 5: Prefix scheduled task output (OpenClaw style)

OpenClaw prefixes cron output with `[cron:{jobId} {jobName}]`. We should do the same so users can tell which message came from a scheduled task.

**Files:**
- Modify: `worker/src/index.ts` — already handled in Task 3 with `[Scheduled: ${task.name}]` prefix

This is already covered in Task 3. No additional work needed.

---

## Summary

After all tasks:
1. `schedule_task` tool stores `channel_id` from the originating context
2. Worker's `processScheduledTask` captures agent output
3. Output is stored in `last_run_output` column and `assistant_messages`
4. An `assistant_outbound_events` row is created targeting the originating channel
5. The existing outbound processor delivers to Telegram/Discord/Slack/WhatsApp/web

**Flow:**
```
User chats via Telegram → agent calls schedule_task (channel_id stored)
  → 60s later, worker claims task
  → runOpenClawAgent produces response
  → INSERT assistant_messages (conversation continuity)
  → INSERT assistant_outbound_events (channel delivery)
  → Outbound processor sends to Telegram
```
