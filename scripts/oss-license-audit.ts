import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { repoRoot } from './oss-export-shared'

interface Args {
  root: string
  out: string
  reviews: string
}

interface PackageLock {
  packages?: Record<string, {
    name?: string
    version?: string
    license?: string
    licenses?: string | string[]
    resolved?: string
    link?: boolean
  }>
}

interface LicenseIssue {
  severity: 'error' | 'warn'
  packageName: string
  version: string
  license: string
  path: string
  reason: string
}

interface LicenseReview {
  package: string
  license: string
  decision: string
  reason: string
}

const DEFAULT_OUT = '.oss-export/reports/sbom.cdx.json'
const DEFAULT_REVIEWS = 'oss-license-reviews.json'

const PROHIBITED_LICENSE_PATTERNS = [
  /\bBUSL\b/i,
  /\bBusiness Source License\b/i,
  /\bCommons Clause\b/i,
  /\bSSPL\b/i,
  /\bproprietary\b/i,
  /\bunlicensed\b/i,
  /\bno license\b/i,
]

const REVIEW_LICENSE_PATTERNS = [
  /\bSEE LICENSE IN\b/i,
  /\bcustom\b/i,
  /\bFSL\b/i,
  /\bFunctional Source License\b/i,
  /\bunknown\b/i,
]

const LICENSE_FILE_NAMES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'COPYING',
  'COPYRIGHT',
]

function parseArgs(argv: string[]): Args {
  const args: Args = {
    root: '.',
    out: DEFAULT_OUT,
    reviews: DEFAULT_REVIEWS,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') {
      const value = argv[index + 1]
      if (!value) throw new Error('--root requires a directory')
      args.root = value
      index += 1
    } else if (arg === '--out') {
      const value = argv[index + 1]
      if (!value) throw new Error('--out requires a file path')
      args.out = value
      index += 1
    } else if (arg === '--reviews') {
      const value = argv[index + 1]
      if (!value) throw new Error('--reviews requires a file path')
      args.reviews = value
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

function packageNameFromPath(packagePath: string): string {
  const parts = packagePath.split('/')
  const nodeModulesIndex = parts.lastIndexOf('node_modules')
  if (nodeModulesIndex === -1) return packagePath || 'root'

  const first = parts[nodeModulesIndex + 1]
  const second = parts[nodeModulesIndex + 2]
  if (!first) return packagePath
  if (first.startsWith('@') && second) return `${first}/${second}`
  return first
}

function readPackageJsonLicense(root: string, packagePath: string): string | undefined {
  const packageJsonPath = path.join(root, packagePath, 'package.json')
  if (!existsSync(packageJsonPath)) return undefined

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      license?: string
      licenses?: string | string[]
    }
    const license = pkg.license ?? pkg.licenses
    return Array.isArray(license) ? license.join(' OR ') : license
  } catch {
    return undefined
  }
}

function detectLicenseFromText(text: string): string | undefined {
  const normalized = text.slice(0, 80_000)

  if (/Apache License\s+Version 2\.0/i.test(normalized)) return 'Apache-2.0'
  if (/MIT License/i.test(normalized) || /Permission is hereby granted, free of charge, to any person obtaining a copy/i.test(normalized)) return 'MIT'
  if (/ISC License/i.test(normalized) || /Permission to use, copy, modify, and\/or distribute this software for any purpose/i.test(normalized)) return 'ISC'
  if (/BSD 3-Clause License/i.test(normalized) || /Redistribution and use in source and binary forms, with or without modification/i.test(normalized)) return 'BSD-3-Clause'
  if (/BSD 2-Clause License/i.test(normalized)) return 'BSD-2-Clause'
  if (/Mozilla Public License Version 2\.0/i.test(normalized)) return 'MPL-2.0'
  if (/Creative Commons Zero v1\.0 Universal/i.test(normalized)) return 'CC0-1.0'
  if (/The Unlicense/i.test(normalized)) return 'Unlicense'
  if (/GNU Affero General Public License/i.test(normalized)) return 'AGPL'
  if (/GNU Lesser General Public License/i.test(normalized)) return 'LGPL'
  if (/GNU General Public License/i.test(normalized)) return 'GPL'

  return undefined
}

function readLicenseFileLicense(root: string, packagePath: string): string | undefined {
  for (const name of LICENSE_FILE_NAMES) {
    const filePath = path.join(root, packagePath, name)
    if (!existsSync(filePath)) continue

    try {
      const detected = detectLicenseFromText(readFileSync(filePath, 'utf8'))
      if (detected) return detected
    } catch {
      continue
    }
  }

  return undefined
}

function requiresReview(license: string): boolean {
  return REVIEW_LICENSE_PATTERNS.some((pattern) => pattern.test(license))
}

function readLockfile(root: string): PackageLock {
  const lockfilePath = path.join(root, 'package-lock.json')
  if (!existsSync(lockfilePath)) {
    throw new Error(`package-lock.json not found in ${root}. Generate the public lockfile first with npm install --package-lock-only --ignore-scripts --legacy-peer-deps.`)
  }

  return JSON.parse(readFileSync(lockfilePath, 'utf8')) as PackageLock
}

function readLicenseReviews(reviewsPath: string): LicenseReview[] {
  if (!existsSync(reviewsPath)) return []

  const payload = JSON.parse(readFileSync(reviewsPath, 'utf8')) as {
    reviewed?: LicenseReview[]
  }
  return payload.reviewed ?? []
}

function reviewPatternMatches(pattern: string, packageName: string): boolean {
  if (pattern === packageName) return true
  if (!pattern.includes('*')) return false

  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}$`).test(packageName)
}

function findLicenseReview(packageName: string, reviews: LicenseReview[]): LicenseReview | undefined {
  return reviews.find((review) => reviewPatternMatches(review.package, packageName))
}

function resolvePackageLicense(root: string, packagePath: string, meta: NonNullable<PackageLock['packages']>[string], packageName: string, reviews: LicenseReview[]): string {
  const lockLicense = meta.license ?? (Array.isArray(meta.licenses) ? meta.licenses.join(' OR ') : meta.licenses)
  const packageJsonLicense = readPackageJsonLicense(root, packagePath)
  const rawLicense = lockLicense ?? packageJsonLicense
  let license = rawLicense && !requiresReview(rawLicense)
    ? rawLicense
    : readLicenseFileLicense(root, packagePath) ?? rawLicense ?? 'UNKNOWN'

  const review = findLicenseReview(packageName, reviews)
  if (review) {
    license = review.license
  }

  return license
}

function readRootPackage(root: string): { name?: string; version?: string } {
  try {
    return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      name?: string
      version?: string
    }
  } catch {
    return {}
  }
}

function licenseToCycloneDxEntry(license: string): { license: { id: string } } | { license: { name: string } } {
  const normalized = license.trim()
  if (/^[A-Za-z0-9-.+]+$/.test(normalized)) {
    return { license: { id: normalized } }
  }

  return { license: { name: normalized } }
}

function writeLockfileSbom(root: string, outPath: string, lockfile: PackageLock, reviews: LicenseReview[]): void {
  const rootPackage = readRootPackage(root)
  const components = Object.entries(lockfile.packages ?? {})
    .filter(([packagePath, meta]) => packagePath !== '' && !meta.link)
    .map(([packagePath, meta]) => {
      const packageName = meta.name ?? packageNameFromPath(packagePath)
      const version = meta.version ?? 'unknown'
      const license = resolvePackageLicense(root, packagePath, meta, packageName, reviews)
      const component: {
        type: 'library'
        name: string
        version: string
        licenses?: ReturnType<typeof licenseToCycloneDxEntry>[]
      } = {
        type: 'library',
        name: packageName,
        version,
      }

      if (license !== 'UNKNOWN') {
        component.licenses = [licenseToCycloneDxEntry(license)]
      }

      return component
    })

  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      tools: [
        {
          vendor: 'Lucid',
          name: 'oss-license-audit',
          version: rootPackage.version ?? '0.0.0',
        },
      ],
      component: {
        type: 'application',
        name: rootPackage.name ?? 'lucid',
        version: rootPackage.version ?? '0.0.0',
      },
    },
    components,
  }

  mkdirSync(path.dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(sbom, null, 2)}\n`)
}

function runNpmSbom(root: string, outPath: string, lockfile: PackageLock, reviews: LicenseReview[]): void {
  try {
    const sbom = execFileSync('npm', ['sbom', '--sbom-format', 'cyclonedx', '--json', '--package-lock-only'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    mkdirSync(path.dirname(outPath), { recursive: true })
    writeFileSync(outPath, sbom)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`WARN npm sbom failed in ${root}; writing lockfile-derived CycloneDX SBOM instead. ${message}`)
    writeLockfileSbom(root, outPath, lockfile, reviews)
  }
}

function collectIssues(root: string, lockfile: PackageLock, reviews: LicenseReview[]): LicenseIssue[] {
  const issues: LicenseIssue[] = []

  for (const [packagePath, meta] of Object.entries(lockfile.packages ?? {})) {
    if (packagePath === '' || meta.link) continue

    const packageName = meta.name ?? packageNameFromPath(packagePath)
    const version = meta.version ?? 'unknown'
    const license = resolvePackageLicense(root, packagePath, meta, packageName, reviews)
    const review = findLicenseReview(packageName, reviews)

    const prohibited = PROHIBITED_LICENSE_PATTERNS.find((pattern) => pattern.test(license))
    if (prohibited) {
      issues.push({
        severity: 'error',
        packageName,
        version,
        license,
        path: packagePath,
        reason: `Prohibited license pattern ${prohibited}`,
      })
      continue
    }

    const needsReview = REVIEW_LICENSE_PATTERNS.find((pattern) => pattern.test(license))
    if (needsReview && !review) {
      issues.push({
        severity: 'warn',
        packageName,
        version,
        license,
        path: packagePath,
        reason: `License requires manual review pattern ${needsReview}`,
      })
    }
  }

  return issues
}

const args = parseArgs(process.argv.slice(2))
const root = path.resolve(repoRoot, args.root)
const outPath = path.resolve(repoRoot, args.out)
const reviewsPath = path.resolve(repoRoot, args.reviews)

const lockfile = readLockfile(root)
const reviews = readLicenseReviews(reviewsPath)
const issues = collectIssues(root, lockfile, reviews)
const errors = issues.filter((issue) => issue.severity === 'error')
const warnings = issues.filter((issue) => issue.severity === 'warn')

runNpmSbom(root, outPath, lockfile, reviews)

for (const warning of warnings.slice(0, 100)) {
  console.warn(`WARN ${warning.packageName}@${warning.version} ${warning.license} (${warning.path}) - ${warning.reason}`)
}

if (errors.length > 0) {
  console.error(`OSS license audit failed with ${errors.length} prohibited license issue(s):`)
  for (const issue of errors) {
    console.error(`- ${issue.packageName}@${issue.version} ${issue.license} (${issue.path}) - ${issue.reason}`)
  }
  process.exit(1)
}

console.log(`OSS license audit passed. SBOM written to ${outPath}. ${warnings.length} warning(s) require review.`)
