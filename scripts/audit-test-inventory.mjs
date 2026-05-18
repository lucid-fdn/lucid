#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const textExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.yml', '.yaml'])
const ignoreDirs = new Set(['.git', '.next', 'node_modules', 'dist', 'build', 'coverage'])

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (ignoreDirs.has(entry.name)) continue
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(rel, files)
    else if (textExtensions.has(path.extname(entry.name))) files.push(rel.replaceAll(path.sep, '/'))
  }
  return files
}

function isTestLike(file) {
  const name = path.basename(file).toLowerCase()
  return /(\b|[-_.])(test|spec|smoke|stress|acceptance|check|gate|quality|preflight|readiness|validate)(\b|[-_.])/.test(name)
    || file.includes('/__tests__/')
    || file.startsWith('tests/')
}

const rootPackage = readJson('package.json')
const workerPackage = readJson('worker/package.json')
const rootScripts = Object.keys(rootPackage.scripts || {})
const workerScripts = Object.keys(workerPackage.scripts || {}).map((script) => `worker:${script}`)

const searchableFiles = [
  ...walk('.github'),
  ...walk('docs'),
  ...walk('scripts'),
  ...walk('tests'),
  ...walk('src'),
  ...walk('worker/src'),
  'README.md',
  'CLAUDE.md',
  'package.json',
  'worker/package.json',
].filter((file, index, arr) => arr.indexOf(file) === index && file !== 'docs/generated/test-inventory.json')

const corpus = new Map(searchableFiles.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]))

function referencedBy(needle, excludeFile = null) {
  const refs = []
  for (const [file, text] of corpus.entries()) {
    if (file === excludeFile) continue
    if (text.includes(needle)) refs.push(file)
  }
  return refs.sort()
}

function commandCategory(name) {
  if (name.startsWith('check:')) return 'canonical'
  if (name.startsWith('knowledge:') || name.startsWith('agent-ops:') || name.startsWith('agent-commerce:')
    || name.startsWith('runtime:') || name.startsWith('work-graph:') || name.startsWith('capability-templates:')
    || name.startsWith('browser-checkout:')) return 'domain-gate'
  if (name.startsWith('test:') || name === 'test') return 'test-entrypoint'
  if (name.includes('dev') || name.includes('build') || name.includes('start') || name.includes('seed')
    || name.includes('env:') || name === 'postinstall' || name === 'sanity') return 'non-test'
  return 'utility'
}

const scriptRows = rootScripts.map((name) => {
  const refs = referencedBy(`npm run ${name}`)
  return {
    name,
    category: commandCategory(name),
    referencedBy: refs.filter((file) => file !== 'package.json'),
  }
})

const looseFiles = [
  ...walk('scripts'),
  ...walk('tests'),
].filter(isTestLike)

const looseRows = looseFiles.map((file) => {
  const slash = file
  const backslash = file.replaceAll('/', '\\')
  const basename = path.basename(file)
  const refs = [...new Set([
    ...referencedBy(slash, file),
    ...referencedBy(backslash, file),
    ...referencedBy(basename, file),
  ])].sort()

  const packageReferenced = refs.includes('package.json') || refs.includes('worker/package.json')
  const ciReferenced = refs.some((ref) => ref.startsWith('.github/'))
  const docsReferenced = refs.some((ref) => ref.startsWith('docs/') || ref === 'README.md' || ref === 'CLAUDE.md')
  const coveredByHarness =
    file.startsWith('tests/e2e/')
    || file.startsWith('tests/integration/')
    || file.startsWith('tests/smoke/')
    || file.startsWith('tests/scripts/')
    || file.startsWith('tests/src/')
    || (file.startsWith('src/') && file.includes('/__tests__/'))
    || (file.startsWith('worker/src/') && file.includes('/__tests__/'))
  const knownManualDiagnostic = file.startsWith('tests/gateway/')
  const category = packageReferenced || ciReferenced || coveredByHarness
    ? 'wired'
    : docsReferenced || knownManualDiagnostic
      ? 'manual-diagnostic'
      : 'unreferenced-candidate'

  return { file, category, referencedBy: refs }
})

const report = {
  generatedAt: new Date().toISOString(),
  packageScripts: scriptRows,
  workerScripts,
  looseTestLikeFiles: looseRows,
  summary: {
    packageScripts: scriptRows.length,
    canonicalScripts: scriptRows.filter((row) => row.category === 'canonical').length,
    domainGateScripts: scriptRows.filter((row) => row.category === 'domain-gate').length,
    looseTestLikeFiles: looseRows.length,
    unreferencedCandidates: looseRows.filter((row) => row.category === 'unreferenced-candidate').length,
    manualDiagnostics: looseRows.filter((row) => row.category === 'manual-diagnostic').length,
  },
}

fs.mkdirSync(path.join(root, 'docs/generated'), { recursive: true })
fs.writeFileSync(path.join(root, 'docs/generated/test-inventory.json'), `${JSON.stringify(report, null, 2)}\n`)

console.log(JSON.stringify(report.summary, null, 2))
const unreferenced = looseRows.filter((row) => row.category === 'unreferenced-candidate')
if (unreferenced.length > 0) {
  console.log('\nUnreferenced candidates:')
  for (const row of unreferenced.slice(0, 50)) console.log(`- ${row.file}`)
  if (unreferenced.length > 50) console.log(`...and ${unreferenced.length - 50} more`)
}
