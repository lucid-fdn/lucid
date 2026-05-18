export interface CronJob {
  name: string
  intervalMs: number
  /** If true, only runs on shared workers (not dedicated runtimes) */
  sharedOnly: boolean
  handler: () => Promise<unknown> | void
}

export interface RunningCron {
  name: string
  timer: ReturnType<typeof setInterval>
}

/**
 * Start cron jobs with per-job overlap guard and error wrapping.
 * Returns named timers for clean shutdown logging.
 */
export function startCronJobs(jobs: CronJob[], isDedicatedRuntime: boolean): RunningCron[] {
  const running: RunningCron[] = []

  for (const job of jobs) {
    if (job.sharedOnly && isDedicatedRuntime) continue

    let isRunning = false
    const timer = setInterval(async () => {
      if (isRunning) {
        console.warn(`[cron] ${job.name} still running, skipping this cycle`)
        return
      }
      isRunning = true
      try {
        await job.handler()
      } catch (err) {
        console.error(`[cron] ${job.name} error:`, err instanceof Error ? err.message : err)
      } finally {
        isRunning = false
      }
    }, job.intervalMs)

    running.push({ name: job.name, timer })
    console.log(`   Cron: ${job.name} (${formatInterval(job.intervalMs)}${job.sharedOnly ? ', shared-only' : ''})`)
  }

  return running
}

function formatInterval(ms: number): string {
  if (ms >= 86_400_000) return `${Math.round(ms / 86_400_000)}d`
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`
  return `${Math.round(ms / 1000)}s`
}
