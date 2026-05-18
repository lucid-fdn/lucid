import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import {
  copyPublicExport,
  readOssExportConfig,
  repoRoot,
  validatePublicBoundary,
} from './oss-export-shared'

interface Args {
  output: string
  clean: boolean
  skipExport: boolean
  skipInstall: boolean
  skipBuild: boolean
  skipTest: boolean
}

function parseArgs(argv: string[]): Args {
  const config = readOssExportConfig()
  const args: Args = {
    output: config.defaultOutputDir,
    clean: false,
    skipExport: false,
    skipInstall: false,
    skipBuild: false,
    skipTest: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output' || arg === '--out') {
      const value = argv[index + 1]
      if (!value) throw new Error(`${arg} requires a directory`)
      args.output = value
      index += 1
    } else if (arg === '--clean') {
      args.clean = true
    } else if (arg === '--skip-export') {
      args.skipExport = true
    } else if (arg === '--skip-install') {
      args.skipInstall = true
    } else if (arg === '--skip-build') {
      args.skipBuild = true
    } else if (arg === '--skip-test') {
      args.skipTest = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

function run(command: string, args: string[], cwd: string): void {
  console.log(`$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_DEPLOYMENT_MODE: process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'self-hosted',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
      NEXT_PRIVATE_OUTPUT_TRACE_ROOT: process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT ?? cwd,
      NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=6144',
    },
  })

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

const args = parseArgs(process.argv.slice(2))
const config = readOssExportConfig()
const outputDir = path.resolve(repoRoot, args.output)

if (!args.skipExport) {
  const result = validatePublicBoundary(config)
  if (result.errors.length > 0) {
    throw new Error(`Public boundary failed:\n${result.errors.join('\n')}`)
  }

  copyPublicExport(result.files, {
    outputDir: args.output,
    clean: args.clean,
    dryRun: false,
  }, config)
}

if (!existsSync(outputDir)) {
  throw new Error(`Public export directory does not exist: ${outputDir}`)
}

if (!args.skipInstall) {
  const npmNetworkArgs = [
    '--fetch-retries=5',
    '--fetch-retry-mintimeout=20000',
    '--fetch-retry-maxtimeout=120000',
    '--prefer-offline',
  ]

  run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--legacy-peer-deps', ...npmNetworkArgs], outputDir)
  run('npm', ['ci', '--legacy-peer-deps', ...npmNetworkArgs], outputDir)
}

run('npm', ['run', 'oss:check'], outputDir)
run('npm', ['run', 'oss:secrets', '--', '--scope', 'private'], outputDir)
run('npm', ['run', 'oss:license', '--', '--root', '.', '--out', '.oss-reports/sbom.cdx.json'], outputDir)
run('npm', ['run', 'typecheck'], outputDir)

if (!args.skipBuild) {
  run('npm', ['run', 'build'], outputDir)
}

if (!args.skipTest) {
  run('npm', ['run', 'oss:public-test'], outputDir)
}

console.log('Public export smoke passed.')
