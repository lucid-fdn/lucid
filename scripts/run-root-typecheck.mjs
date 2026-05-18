import { existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const tsbuildinfoPath = resolve(repoRoot, 'tsconfig.tsbuildinfo')
const tscEntrypoint = resolve(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')

const clean = process.env.TYPECHECK_CLEAN === '1'
const timeoutMs = Number.parseInt(process.env.TYPECHECK_TIMEOUT_MS ?? '300000', 10)
if (clean) {
  rmSync(tsbuildinfoPath, { force: true })
} else if (!existsSync(tsbuildinfoPath)) {
  console.warn('[typecheck] No tsconfig.tsbuildinfo cache found; first run may be slower. Set TYPECHECK_CLEAN=1 for a cold check.')
}

const startedAt = Date.now()

const result = spawnSync(
  process.execPath,
  ['--max-old-space-size=6144', tscEntrypoint, '-p', 'tsconfig.json', '--noEmit'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
  },
)

if (result.error?.code === 'ETIMEDOUT') {
  console.error(`[typecheck] Timed out after ${Math.round((Date.now() - startedAt) / 1000)}s. Re-run with TYPECHECK_TIMEOUT_MS=<ms> or TYPECHECK_CLEAN=1 for a cold diagnostic.`)
  process.exit(124)
}

process.exit(result.status ?? 1)
