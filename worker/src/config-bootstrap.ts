/**
 * Runtime Config Bootstrap
 *
 * For dedicated runtimes: fetches the full env var set from the control plane
 * on startup and merges it into process.env BEFORE config.ts is evaluated.
 *
 * This ensures that secrets rotated after initial deployment are picked up
 * on the next restart without re-provisioning the runtime.
 *
 * Constraints:
 * - Must NOT import from config.ts (would cause a circular init problem)
 * - Must complete before any module that calls getConfig()
 * - Uses only Node built-ins (fetch is available in Node 18+)
 *
 * Lifecycle:
 * - LUCID_RUNTIME_ID absent → shared worker or self-host, no-op
 * - Fetch succeeds → merge env vars (existing values take precedence), continue
 * - Fetch fails + SUPABASE_URL set → warn + continue with existing env
 * - Fetch fails + no SUPABASE_URL → fatal (runtime can't operate without DB)
 * - HTTP 410 → runtime revoked → fatal exit
 */

const MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 1_000
const FETCH_TIMEOUT_MS = 15_000

export async function bootstrapRuntimeConfig(): Promise<void> {
  const runtimeId = process.env.LUCID_RUNTIME_ID
  const runtimeKey = process.env.LUCID_RUNTIME_KEY
  const controlPlaneUrl = process.env.LUCID_CONTROL_PLANE_URL

  // Skip for shared workers and self-hosted installs
  if (!runtimeId || !runtimeKey || !controlPlaneUrl) return

  const url = `${controlPlaneUrl.replace(/\/+$/, '')}/api/runtimes/config`

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${runtimeKey}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      // Revoked runtime — do not start
      if (res.status === 410) {
        console.error('[bootstrap] Runtime revoked (410) — exiting')
        process.exit(1)
        return // allow test environments where process.exit is mocked
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${text}`)
      }

      const data = (await res.json()) as {
        envVars: Record<string, string>
        configVersion: string
      }

      // Control-plane managed config is authoritative for keys it returns.
      // Preserve local-only env vars by leaving absent keys untouched.
      let applied = 0
      for (const [key, value] of Object.entries(data.envVars)) {
        if (process.env[key] !== value) {
          process.env[key] = value
          applied++
        }
      }

      // Store config version for heartbeat drift detection
      process.env.LUCID_CONFIG_VERSION = data.configVersion

      console.log(
        `[bootstrap] Config loaded (${applied} vars applied, version=${data.configVersion.slice(0, 8)})`,
      )
      return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[bootstrap] Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`)

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * attempt))
      }
    }
  }

  // All attempts failed
  if (process.env.SUPABASE_URL) {
    console.warn(
      '[bootstrap] Config fetch failed — continuing with existing env (SUPABASE_URL is set)',
    )
  } else {
    console.error('[bootstrap] Config fetch failed and SUPABASE_URL not set — cannot start')
    process.exit(1)
  }
}
