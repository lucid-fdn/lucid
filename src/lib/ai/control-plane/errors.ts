import 'server-only'

export type AIGenerationControlPlaneErrorCode =
  | 'invalid_context'
  | 'policy_blocked'
  | 'adapter_failed'
  | 'event_write_failed'

export class AIGenerationControlPlaneError extends Error {
  constructor(
    public code: AIGenerationControlPlaneErrorCode,
    message: string,
    public statusCode = 500,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'AIGenerationControlPlaneError'
  }
}
