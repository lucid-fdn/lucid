#!/usr/bin/env npx tsx
import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'
import { WEB3_CAPABILITY_TEMPLATES } from '@/lib/templates/capabilities/catalog'
import { validateCapabilityTemplateManifest } from './validate'

type ValidationTarget = {
  label: string
  manifest: unknown
}

const args = process.argv.slice(2).filter((arg) => arg !== '--first-party')

async function main() {
  const targets = args.length > 0
    ? args.map(readManifestFile)
    : WEB3_CAPABILITY_TEMPLATES.map((manifest) => ({ label: manifest.key, manifest }))

  let failed = 0
  for (const target of targets) {
    const result = validateCapabilityTemplateManifest(target.manifest)
    if (result.ok) {
      console.log(`✓ ${target.label}`)
      continue
    }

    failed += 1
    console.error(`✗ ${target.label}`)
    for (const issue of result.issues) {
      console.error(`  - [${issue.code}] ${issue.path}: ${issue.message}`)
    }
  }

  if (failed > 0) {
    console.error(`\n${failed}/${targets.length} capability template manifest(s) failed conformance.`)
    process.exit(1)
  }

  console.log(`\n${targets.length} capability template manifest(s) passed conformance.`)
}

function readManifestFile(filePath: string): ValidationTarget {
  const absolutePath = path.resolve(process.cwd(), filePath)
  const manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as unknown
  return {
    label: filePath,
    manifest,
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
