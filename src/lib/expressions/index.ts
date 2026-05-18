/**
 * Agent Personality Layer — Centralized Expression Catalogs
 *
 * Rotating pools of human, warm, alive labels for agent states,
 * events, presence, and connection status. Makes agents feel like
 * living beings instead of cold status machines.
 *
 * Features:
 * - Deterministic rotation (same seed → same phrase, different agents → different phrases)
 * - Time-of-day awareness (morning/afternoon/evening/night flavors)
 * - Agent personality vibes (formal/playful/nerdy/chill derived from name hash)
 * - Run narrative (story arc from start → middle → end)
 * - Error recovery moments
 *
 * Usage:
 *   getStatusLabel('active', agent.id)         → "In the zone"
 *   getEventLabel('run_started', event.id)     → "Rising and shining"
 *   getPresenceLabel('thinking', agent.id)     → "Neurons firing"
 *   getTimeAwareGreeting(agent.id)             → "Burning the midnight oil" (at 2am)
 *   getRunSummary(events, runId)               → "Handled a swap in 4.2s"
 */

// ── Core picker ──────────────────────────────────────────────────────

/** Pick a pseudo-random expression from a pool, stable for a given seed */
export function pickExpression(
  catalog: Record<string, readonly string[]>,
  key: string,
  seed?: string,
): string {
  const pool = catalog[key]
  if (!pool?.length) return key
  const s = seed ?? key
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return pool[Math.abs(hash) % pool.length]
}

/** Pick from a flat string array using a seed */
function pickFromPool(pool: readonly string[], seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return pool[Math.abs(hash) % pool.length]
}

// ── Time-of-Day Awareness (#1) ──────────────────────────────────────

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

const TIME_GREETINGS: Record<TimeOfDay, readonly string[]> = {
  morning: [
    'Early bird mode', 'Fresh start', 'Morning brew loading',
    'Rise and grind', 'Dawn patrol', 'Sunrise hustle',
  ],
  afternoon: [
    'Afternoon flow', 'Cruising along', 'Peak hours',
    'In the groove', 'Steady state', 'Full steam',
  ],
  evening: [
    'Evening shift', 'Golden hour', 'Winding down gracefully',
    'Sunset mode', 'Late bloomer', 'Night owl warming up',
  ],
  night: [
    'Burning the midnight oil', 'Night owl mode', 'After hours',
    'While the world sleeps', 'Moonlight hustle', 'Late night vibes',
  ],
} as const

/** Get a time-aware flavor text for an agent (stable per agent per time-of-day) */
export function getTimeAwareGreeting(agentId?: string): string {
  const tod = getTimeOfDay()
  const seed = agentId ? `${tod}:${agentId}` : tod
  return pickFromPool(TIME_GREETINGS[tod], seed)
}

/** Time-aware idle expressions — blended with time of day */
const TIME_IDLE: Record<TimeOfDay, readonly string[]> = {
  morning: ['Sipping morning data', 'Warming up circuits', 'Stretching its neurons'],
  afternoon: ['Post-lunch zen', 'Afternoon daydream', 'Coasting calmly'],
  evening: ['Winding down', 'Evening contemplation', 'Dimming the lights'],
  night: ['Night watch', 'Guarding the fort', 'Stargazing quietly'],
} as const

/** Get an idle label enriched with time-of-day context */
export function getTimeAwareIdleLabel(agentId?: string): string {
  const tod = getTimeOfDay()
  const seed = agentId ? `idle:${tod}:${agentId}` : `idle:${tod}`
  return pickFromPool(TIME_IDLE[tod], seed)
}

// ── Agent Personality Vibes (#6) ─────────────────────────────────────

export type AgentVibe = 'formal' | 'playful' | 'nerdy' | 'chill'

const VIBES: AgentVibe[] = ['formal', 'playful', 'nerdy', 'chill']

/** Derive a personality vibe from agent ID (deterministic) */
export function getAgentVibe(agentId: string): AgentVibe {
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0
  }
  return VIBES[Math.abs(hash) % VIBES.length]
}

/** Vibe-flavored status overrides — adds personality on top of base expressions */
const VIBE_STATUS: Record<AgentVibe, Record<string, readonly string[]>> = {
  formal: {
    active: ['Operational', 'Processing', 'Engaged', 'At your service'],
    paused: ['Standing by', 'Awaiting instructions', 'On hold'],
    idle: ['Ready and waiting', 'At ease', 'Standing down'],
    error: ['Experiencing difficulties', 'Investigating an issue', 'Troubleshooting'],
  },
  playful: {
    active: ['Let\'s goooo!', 'Party mode', 'Doing the thing!', 'Zooming!'],
    paused: ['Snooze button hit', 'Taking five', 'BRB!'],
    idle: ['Bored... entertain me?', 'Twiddling thumbs', '*yawns*'],
    error: ['Whoopsie daisy', 'My bad!', 'Oops, butterfingers'],
  },
  nerdy: {
    active: ['Executing main loop', 'Threads running', 'CPU go brrr'],
    paused: ['Process suspended', 'SIGSTOP received', 'Yield()'],
    idle: ['Awaiting input buffer', 'Event loop empty', 'gc.collect()'],
    error: ['Segfault vibes', 'Stack trace incoming', 'Exception caught'],
  },
  chill: {
    active: ['Flowing', 'Easy does it', 'Smooth sailing', 'No rush'],
    paused: ['Hammock time', 'Beach mode', 'Catching waves'],
    idle: ['Zen garden', 'Om...', 'Just breathing', 'Peace and quiet'],
    error: ['No worries, fixing it', 'All good, be right back', 'Small hiccup'],
  },
} as const

/** Get a vibe-flavored status label (mixes base + personality) */
export function getVibeStatusLabel(status: string, agentId: string): string {
  const vibe = getAgentVibe(agentId)
  const vibePool = VIBE_STATUS[vibe][status]
  if (!vibePool) return getStatusLabel(status, agentId)
  // 60% chance to use vibe-specific, 40% base — keeps variety
  const seed = `${status}:${agentId}`
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  if (Math.abs(hash) % 5 < 3) {
    return pickFromPool(vibePool, seed)
  }
  return pickExpression(STATUS_EXPRESSIONS, status, seed)
}

// ── Agent Status ─────────────────────────────────────────────────────

export const STATUS_EXPRESSIONS: Record<string, readonly string[]> = {
  active: [
    'Vibing', 'In the zone', 'On it', 'Locked in', 'Humming along',
    'Doing its thing', 'Wide awake', 'Firing on all cylinders', 'In flow',
  ],
  paused: [
    'Taking a breather', 'Napping', 'On standby', 'Catching its breath',
    'Power nap', 'Snoozing softly', 'On pause', 'Resting up',
  ],
  error: [
    'Having a moment', 'Hit a bump', 'Tripped up', 'Needs a hug',
    'Oops', 'Feeling glitchy', 'A bit lost', 'Working through it',
  ],
  idle: [
    'Daydreaming', 'Chilling', 'Waiting for a spark', 'Just hanging out',
    'Twiddling its bytes', 'Cloud-gazing', 'Pondering life', 'At ease',
  ],
} as const

export function getStatusLabel(status: string, agentId?: string): string {
  return pickExpression(STATUS_EXPRESSIONS, status, agentId ? `${status}:${agentId}` : undefined)
}

// ── Feed Events ──────────────────────────────────────────────────────

export const EVENT_EXPRESSIONS: Record<string, readonly string[]> = {
  tool_call: ['Reaching for a tool', 'Grabbing a gadget', 'Pulling out a trick', 'Using superpowers'],
  tool_result: ['Got something back', 'Results are in', 'Found something', 'Data acquired'],
  error: ['Stumbled', 'Hit a snag', 'Oops', 'Ran into a wall', 'Tripped over something'],
  approval_requested: ['Asking permission', 'Raising its hand', 'Checking with the boss', 'Requesting clearance'],
  approval_resolved: ['Got the green light', 'Permission granted', 'Cleared for action', 'Thumbs up received'],
  run_started: ['Waking up', 'Stretching its legs', 'Booting up', 'Rising and shining'],
  run_finished: ['Wrapping up', 'All done', 'Mission complete', 'Dusting off hands'],
  agent_paused: ['Taking a nap', 'Going quiet', 'Settling down', 'Hitting pause'],
  agent_resumed: ['Back at it', 'Woke up fresh', 'Ready to roll', 'Recharged'],
  message_received: ['Heard something', 'Ears perked up', 'Incoming signal', 'Got a ping'],
  message_sent: ['Spoke up', 'Dropped a reply', 'Said its piece', 'Chimed in'],
  transaction_submitted: ['Sending it', 'Launching a tx', 'Firing away', 'Package sent'],
  transaction_confirmed: ['Nailed it', 'Sealed the deal', 'Transaction landed', 'Success!'],
  transaction_failed: ['Oops, bounced', 'Tx didn\'t land', 'Bounced back', 'That didn\'t stick'],
  remediation_triggered: ['Self-healing', 'Patching itself up', 'Running a fix', 'Auto-recovering'],
  receipt_created: ['Logging the proof', 'Receipt minted', 'Stamping the ledger', 'On the record'],
  receipt_verified: ['Checking the math', 'Proof confirmed', 'Integrity check passed', 'Trust verified'],
  passport_provisioned: ['Got its passport', 'Identity minted', 'L2 identity live', 'Passport stamped'],
  epoch_anchored: ['Sealed on-chain', 'Anchored to Solana', 'Permanently recorded', 'Etched in stone', 'Chain-stamped'],
  task_scheduled: ['Set a reminder', 'Scheduled a task', 'Clock is ticking', 'Timer set'],
  task_completed: ['Task done', 'Cron delivered', 'On schedule', 'Right on time'],
  task_failed: ['Cron stumbled', 'Task didn\'t land', 'Scheduled task failed', 'Missed the mark'],
  task_cancelled: ['Task called off', 'Cron cancelled', 'Unscheduled', 'Pulled the plug'],
  agent_message_sent: ['Sent a message', 'Pinged a teammate', 'Reached out', 'Called out'],
  subagent_spawned: ['Spawned a helper', 'Delegated a task', 'Called in backup', 'Split the work'],
  subagent_completed: ['Helper finished', 'Subtask done', 'Backup reported in', 'Delegation complete'],
  subagent_failed: ['Helper stumbled', 'Subtask failed', 'Backup hit a wall', 'Delegation failed'],
} as const

export function getEventLabel(eventType: string, eventId?: string): string {
  return pickExpression(EVENT_EXPRESSIONS, eventType, eventId ? `${eventType}:${eventId}` : undefined)
}

// ── Error Recovery (#7) ──────────────────────────────────────────────

export const RECOVERY_EXPRESSIONS: readonly string[] = [
  'Back on track!', 'Crisis averted', 'All good now',
  'Found its footing', 'Bounced right back', 'Good as new',
  'That was close!', 'Dusted itself off', 'Lesson learned',
] as const

/** Get a recovery expression when agent goes error → active/idle */
export function getRecoveryLabel(agentId?: string): string {
  return pickFromPool(RECOVERY_EXPRESSIONS, agentId ?? 'recovery')
}

// ── Success Celebrations (#3) ────────────────────────────────────────

export const CELEBRATION_EXPRESSIONS: Record<string, readonly string[]> = {
  transaction_confirmed: [
    'Ka-ching!', 'Money moves!', 'Smooth operator',
    'Transaction perfection', 'Sealed and delivered',
  ],
  run_finished: [
    'Another one in the bag', 'Clean sweep', 'Nailed it',
    'Task crushed', 'Done and dusted',
  ],
  approval_resolved: [
    'Trust earned', 'Green light secured', 'Cleared for takeoff',
    'Permission slip: signed', 'All clear, captain',
  ],
  epoch_anchored: [
    'On-chain forever', 'Immutable proof', 'Sealed the epoch',
    'Blockchain stamped', 'Anchored and verified',
  ],
} as const

/** Get a celebration label for success events */
export function getCelebrationLabel(eventType: string, eventId?: string): string {
  const pool = CELEBRATION_EXPRESSIONS[eventType]
  if (!pool) return getEventLabel(eventType, eventId)
  return pickFromPool(pool, eventId ?? eventType)
}

/** Is this event a "celebration-worthy" success? */
export function isCelebrableEvent(eventType: string): boolean {
  return eventType === 'transaction_confirmed' || eventType === 'run_finished' || eventType === 'epoch_anchored' || eventType === 'subagent_completed'
}

// ── Run Narrative (#5) ───────────────────────────────────────────────

export const RUN_SUMMARY_TEMPLATES: readonly string[] = [
  'Handled {action} in {duration}',
  '{action} — done in {duration}',
  'Wrapped up {action} ({duration})',
  '{action} complete · {duration}',
] as const

/** Build a human run summary from events */
export function getRunSummary(
  events: { event_type: string; created_at: string; payload?: Record<string, unknown> }[],
  runId: string,
): string | null {
  if (events.length < 2) return null

  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const durationMs = new Date(last.created_at).getTime() - new Date(first.created_at).getTime()
  const duration = durationMs < 1000
    ? `${durationMs}ms`
    : durationMs < 60_000
      ? `${(durationMs / 1000).toFixed(1)}s`
      : `${(durationMs / 60_000).toFixed(1)}m`

  // Detect the main action from events
  const hasTx = events.some((e) => e.event_type.startsWith('transaction_'))
  const hasApproval = events.some((e) => e.event_type === 'approval_requested')
  const hasMessage = events.some((e) => e.event_type === 'message_sent')
  const toolCalls = events.filter((e) => e.event_type === 'tool_call')

  let action = 'a request'
  if (hasTx) action = 'a transaction'
  else if (hasApproval) action = 'an approval flow'
  else if (toolCalls.length > 2) action = `${toolCalls.length} tool calls`
  else if (toolCalls.length === 1) action = 'a tool call'
  else if (hasMessage) action = 'a message'

  const template = pickFromPool(RUN_SUMMARY_TEMPLATES, runId)
  return template.replace('{action}', action).replace('{duration}', duration)
}

// ── Warm Empty States (#4) ───────────────────────────────────────────

export const EMPTY_STATE_EXPRESSIONS: Record<string, { title: string; description: string }[]> = {
  agents: [
    { title: 'Your workspace is quiet.', description: 'Create an agent, use a template, or connect a runtime.' },
    { title: 'No agents yet.', description: 'Start with one agent and expand from there.' },
    { title: 'Nothing here yet.', description: 'Create your first agent to get started.' },
  ],
  feed: [
    { title: 'No activity yet.', description: 'Events appear here when your agents run.' },
    { title: 'Nothing happening yet.', description: 'Send a message to an agent to see events here.' },
    { title: 'Waiting for events.', description: 'Your live feed will populate as agents work.' },
  ],
  context: [
    { title: 'No agent selected.', description: 'Click one from the list to see its details.' },
    { title: 'Select an agent.', description: 'Choose an agent to view its state, memory, and tools.' },
    { title: 'Nothing selected.', description: 'Tap an agent to inspect it.' },
  ],
  memories: [
    { title: 'No memories yet.', description: 'Memories form as your agent interacts with users.' },
    { title: 'Nothing learned yet.', description: 'Conversations will build this agent\'s memory over time.' },
  ],
  conversations: [
    { title: 'No conversations yet.', description: 'Messages will appear once users start chatting.' },
    { title: 'Nothing here yet.', description: 'Conversations show up as users interact with your agents.' },
  ],
  assistants: [
    { title: 'No agents yet.', description: 'Create an agent and connect it to a channel.' },
    { title: 'Nothing here yet.', description: 'Build your first agent to get started.' },
    { title: 'Your workspace is empty.', description: 'Create an agent or import a template.' },
  ],
} as const

/** Get a warm empty state (stable per context + optional seed) */
export function getEmptyState(
  context: string,
  seed?: string,
): { title: string; description: string } {
  const pool = EMPTY_STATE_EXPRESSIONS[context]
  if (!pool?.length) return { title: 'Nothing here', description: '' }
  const s = seed ?? context
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return pool[Math.abs(hash) % pool.length]
}

// ── Presence (real-time agent activity) ──────────────────────────────

export const PRESENCE_EXPRESSIONS: Record<string, readonly string[]> = {
  idle: [
    'Chilling', 'Just vibing', 'Waiting patiently', 'Lost in thought',
    'Stargazing', 'Counting sheep', 'Zen mode', 'Meditating quietly',
  ],
  receiving: [
    'Listening...', 'All ears', 'Reading carefully', 'Taking it in',
    'Processing your words', 'Absorbing', 'Hmm, interesting...',
  ],
  thinking: [
    'Cooking something up', 'Brainstorming', 'Neurons firing',
    'Connecting the dots', 'Deep in thought', 'Mulling it over',
    'Having a eureka moment', 'Crunching ideas',
  ],
  'tool-calling': [
    'Tinkering', 'Pulling some levers', 'Doing research',
    'Digging around', 'Running experiments', 'On a quest',
    'Assembling the pieces', 'Hacking away',
  ],
  responding: [
    'Crafting a reply', 'Writing back', 'Putting words together',
    'Composing thoughts', 'Almost ready...', 'Typing furiously',
    'Polishing the answer', 'Here it comes...',
  ],
} as const

export function getPresenceLabel(state: string, agentId?: string): string {
  // Enrich idle with time-of-day awareness
  if (state === 'idle' && agentId) {
    // 40% chance to use time-aware idle instead of base
    const seed = `${state}:${agentId}`
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
    }
    if (Math.abs(hash) % 5 < 2) {
      return getTimeAwareIdleLabel(agentId)
    }
  }
  return pickExpression(PRESENCE_EXPRESSIONS, state, agentId ? `${state}:${agentId}` : undefined)
}

// ── Connection Status ────────────────────────────────────────────────

export const CONNECTION_EXPRESSIONS: Record<string, readonly string[]> = {
  connected: ['Alive & kicking', 'Online and happy', 'All systems go', 'Heartbeat strong'],
  stale: ['Drifting off', 'Getting sleepy', 'Signal fading', 'Zoning out'],
  offline: ['Gone quiet', 'Lights out', 'Radio silence', 'Off the grid'],
} as const

export function getConnectionLabel(status: string, runtimeId?: string): string {
  return pickExpression(CONNECTION_EXPRESSIONS, status, runtimeId ? `${status}:${runtimeId}` : undefined)
}
