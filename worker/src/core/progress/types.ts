export type ChannelProgressPhase =
  | 'queued'
  | 'thinking'
  | 'memory'
  | 'fetching'
  | 'browser'
  | 'tool_running'
  | 'approval_waiting'
  | 'writing'
  | 'completed'
  | 'failed'
  | 'stalled'

export interface ChannelProgressEvent {
  id: string
  runId?: string
  phase: ChannelProgressPhase
  label: string
  detail?: string
  capability?: string
  toolName?: string
  riskLevel?: 'read' | 'low' | 'medium' | 'high'
  timestamp: string
  source: 'runtime' | 'tool' | 'memory' | 'browser' | 'commerce' | 'system'
}

export interface ChannelProgressDescriptor {
  phase: ChannelProgressPhase
  label: string
  detail?: string
  capability?: string
  riskLevel?: ChannelProgressEvent['riskLevel']
  source?: ChannelProgressEvent['source']
}

export type ChannelProgressEmitter = (event: ChannelProgressDescriptor) => void | Promise<void>
