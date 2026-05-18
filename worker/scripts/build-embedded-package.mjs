import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(workerRoot, '..')
const embeddedRoot = resolve(repoRoot, 'packages/embedded')
const embeddedOutput = resolve(embeddedRoot, 'dist/index.js')
const embeddedModuleOutput = resolve(embeddedRoot, 'dist/index.mjs')

if (existsSync(embeddedOutput) || existsSync(embeddedModuleOutput)) {
  console.log(`[embedded] Using existing build at ${existsSync(embeddedOutput) ? embeddedOutput : embeddedModuleOutput}`)
  process.exit(0)
}

const result = spawnSync(
  'npm',
  [
    'exec',
    '--yes',
    '--package=tsup@^8.4.0',
    '--package=typescript@^5.6.0',
    '--',
    'tsup',
    resolve(embeddedRoot, 'src/index.ts'),
    '--no-config',
    '--format',
    'esm',
    '--target',
    'node20',
    '--out-dir',
    resolve(embeddedRoot, 'dist'),
    '--clean',
    '--external',
    'jsdom',
    '--external',
    'cheerio',
    '--external',
    '@modelcontextprotocol/sdk/client/index.js',
    '--external',
    '@modelcontextprotocol/sdk/inMemory.js',
    '--external',
    '@modelcontextprotocol/sdk/server/mcp.js',
    '--shims',
  ],
  {
    cwd: workerRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
)

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
