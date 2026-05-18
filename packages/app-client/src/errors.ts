export type LucidApiErrorDetails = {
  status: number
  code?: string
  body?: unknown
}

export class LucidApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly body?: unknown

  constructor(message: string, details: LucidApiErrorDetails) {
    super(message)
    this.name = 'LucidApiError'
    this.status = details.status
    this.code = details.code
    this.body = details.body
  }
}
