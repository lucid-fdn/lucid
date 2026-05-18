export type BuilderTelemetryEvent =
  | 'submit:start'
  | 'submit:queued'
  | 'submit:failed'
  | 'progress'
  | 'result'
  | 'optimistic-draft'
  | 'template-suggestion:start'
  | 'template-suggestion:ready'
  | 'template-suggestion:empty'
  | 'template-suggestion:error'
  | 'capability-metadata:start'
  | 'capability-metadata:ready'
  | 'capability-metadata:error'
  | 'decision-card:dismiss'
  | 'assistant:local-message'
  | 'assistant:local-message:removed'

export interface BuilderTelemetryPayload {
  [key: string]: unknown
}
