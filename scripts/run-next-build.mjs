import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const nextEntrypoint = resolve(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
const heapMb = process.env.NEXT_BUILD_MAX_OLD_SPACE_MB || '6144'
const nextArgs = []
const envOverrides = {}

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index]
  if (arg === '--dist-dir') {
    const distDir = process.argv[index + 1]
    if (!distDir) {
      console.error('[build] Missing value for --dist-dir')
      process.exit(1)
    }
    envOverrides.NEXT_DIST_DIR = distDir
    index += 1
    continue
  }
  if (arg === '--serial') {
    envOverrides.NEXT_DISABLE_WEBPACK_BUILD_WORKER = '1'
    continue
  }
  if (arg === '--standalone') {
    envOverrides.NEXT_OUTPUT_STANDALONE = '1'
    continue
  }
  nextArgs.push(arg)
}

function withNodeOption(existing, option) {
  const current = existing?.trim()
  if (!current) return option
  if (current.includes(option.split('=')[0])) return current
  return `${current} ${option}`
}

const env = {
  ...process.env,
  ...envOverrides,
  NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || '1',
  SENTRY_DISABLE_TELEMETRY: process.env.SENTRY_DISABLE_TELEMETRY || '1',
  SENTRY_UPLOAD_SOURCE_MAPS: process.env.SENTRY_UPLOAD_SOURCE_MAPS || 'false',
  SENTRY_WEBPACK_PLUGIN_SKIP: process.env.SENTRY_WEBPACK_PLUGIN_SKIP || 'true',
  NEXT_DISABLE_WEBPACK_BUILD_WORKER: envOverrides.NEXT_DISABLE_WEBPACK_BUILD_WORKER || process.env.NEXT_DISABLE_WEBPACK_BUILD_WORKER || '0',
  NEXT_DISABLE_WEBPACK_CACHE: process.env.NEXT_DISABLE_WEBPACK_CACHE || '1',
  NEXT_OUTPUT_STANDALONE: envOverrides.NEXT_OUTPUT_STANDALONE || process.env.NEXT_OUTPUT_STANDALONE || '0',
}

env.NODE_OPTIONS = withNodeOption(env.NODE_OPTIONS, `--max-old-space-size=${heapMb}`)

console.log(
  `[build] next build with heap=${heapMb}MB webpackWorker=${env.NEXT_DISABLE_WEBPACK_BUILD_WORKER === '1' ? 'disabled' : 'enabled'} webpackCache=${env.NEXT_DISABLE_WEBPACK_CACHE === '1' ? 'disabled' : 'enabled'} standalone=${env.NEXT_OUTPUT_STANDALONE === '1' ? 'enabled' : 'disabled'} distDir=${env.NEXT_DIST_DIR || '.next'}`,
)

const result = spawnSync(process.execPath, [nextEntrypoint, 'build', ...nextArgs], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
