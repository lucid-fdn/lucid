import path from 'node:path'

import {
  copyPublicExport,
  readOssExportConfig,
  repoRoot,
  validatePublicBoundary,
} from './oss-export-shared'

interface Args {
  clean: boolean
  dryRun: boolean
  outputDir?: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    clean: false,
    dryRun: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--clean') {
      args.clean = true
    } else if (arg === '--dry-run') {
      args.dryRun = true
    } else if (arg === '--out') {
      const value = argv[index + 1]
      if (!value) throw new Error('--out requires a directory')
      args.outputDir = value
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

const config = readOssExportConfig()
const args = parseArgs(process.argv.slice(2))
const outputDir = args.outputDir ?? config.defaultOutputDir
const result = validatePublicBoundary(config)

if (result.errors.length > 0) {
  console.error(`Public export boundary failed with ${result.errors.length} error(s):`)
  for (const error of result.errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

copyPublicExport(result.files, {
  outputDir,
  clean: args.clean,
  dryRun: args.dryRun,
}, config)

const resolvedOutput = path.resolve(repoRoot, outputDir)
const mode = args.dryRun ? 'Dry run selected' : 'Export complete'

console.log(`${mode}. ${result.files.length} files selected for public export.`)
console.log(`Output: ${resolvedOutput}`)
