declare module 'croner' {
  export class Cron {
    constructor(pattern: string, options?: { timezone?: string; [key: string]: unknown })
    nextRun(): Date | null
    stop(): void
  }
}
