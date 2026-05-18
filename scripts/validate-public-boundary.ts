import { validatePublicBoundary } from './oss-export-shared'

const result = validatePublicBoundary()

for (const warning of result.warnings) {
  console.warn(`WARN ${warning}`)
}

if (result.errors.length > 0) {
  console.error(`Public export boundary failed with ${result.errors.length} error(s):`)
  for (const error of result.errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log(`Public export boundary is valid. ${result.files.length} files selected.`)
