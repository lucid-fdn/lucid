import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

import type { SkillPackage } from './package'
import {
  SkillCapabilityTierSchema,
  SkillTrustTierSchema,
  SkillVariantSchema,
  type SkillVariant,
} from '@contracts/skill'

const INTERNAL_SKILLS_ROOT = path.join(process.cwd(), 'worker', 'src', 'skills')
const DEFAULT_RUNTIME_FLAVORS = ['shared', 'c1_managed', 'c2a_autonomous']
const DEFAULT_RUNTIME_NATIVE_CHANNELS = ['lucid_relay', 'runtime_native']

interface ParsedSkillMarkdown {
  frontmatter: Record<string, unknown>
  body: string
}

function resolveExplicitVariants(frontmatter: Record<string, unknown>, requiredTools: string[]): SkillVariant[] {
  const engineSupport = frontmatter.engine_support
  if (Array.isArray(engineSupport)) {
    const parsed = engineSupport
      .map((variant) => SkillVariantSchema.safeParse(variant))
      .filter((result) => result.success)
      .map((result) => ({
        ...result.data,
        required_tools: result.data.required_tools?.length ? result.data.required_tools : requiredTools,
      }))

    if (parsed.length > 0) return parsed
  }

  // Conservative fallback for legacy first-party skills without explicit certification.
  return [{
    engine: 'openclaw',
    support_level: 'native',
    runtime_flavors: DEFAULT_RUNTIME_FLAVORS,
    channel_ownership: DEFAULT_RUNTIME_NATIVE_CHANNELS,
    required_tools: requiredTools,
  }]
}

function parseSkillMarkdown(raw: string): ParsedSkillMarkdown {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return { frontmatter: {}, body: raw }
  }

  try {
    const parsed = yaml.load(match[1])
    const frontmatter = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
    return { frontmatter, body: match[2] }
  } catch {
    return { frontmatter: {}, body: raw }
  }
}

function extractRequiredTools(markdown: string): string[] {
  const section = markdown.match(/## Required Tools([\s\S]*?)(?:\n## |\n# |$)/)
  const target = section?.[1] ?? markdown
  const tools = new Set<string>()

  for (const match of target.matchAll(/`([a-z][a-z0-9_]+)`/g)) {
    tools.add(match[1])
  }

  return Array.from(tools).sort()
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return listFilesRecursive(absolute)
    }
    return [absolute]
  }))

  return files.flat().sort()
}

async function listRelativeFiles(dir: string): Promise<string[]> {
  const files = await listFilesRecursive(dir)
  return files.map(file => path.relative(dir, file)).sort()
}

export async function getEmbeddedInternalSkillPath(slug: string): Promise<string | null> {
  const skillDir = path.join(INTERNAL_SKILLS_ROOT, slug)
  try {
    await fs.access(path.join(skillDir, 'SKILL.md'))
    return path.relative(process.cwd(), skillDir).split(path.sep).join('/')
  } catch {
    return null
  }
}

async function buildArtifactChecksum(skillDir: string, files: string[]): Promise<string> {
  const hash = createHash('sha256')
  for (const relative of files) {
    const absolute = path.join(skillDir, relative)
    const content = await fs.readFile(absolute)
    hash.update(relative)
    hash.update('\n')
    hash.update(content)
    hash.update('\n')
  }
  return hash.digest('hex')
}

export async function listInternalSkillPackages(): Promise<SkillPackage[]> {
  const entries = await fs.readdir(INTERNAL_SKILLS_ROOT, { withFileTypes: true })
  const skillDirs = entries.filter((entry) => entry.isDirectory())

  const skills = await Promise.all(skillDirs.map(async (entry) => {
    const skillDir = path.join(INTERNAL_SKILLS_ROOT, entry.name)
    const skillPath = path.join(skillDir, 'SKILL.md')

    let raw: string
    try {
      raw = await fs.readFile(skillPath, 'utf8')
    } catch {
      return null
    }

    const { frontmatter, body } = parseSkillMarkdown(raw)
    const files = await listRelativeFiles(skillDir)
    const checksum = await buildArtifactChecksum(skillDir, files)
    const slug = typeof frontmatter.slug === 'string' && frontmatter.slug.trim()
      ? frontmatter.slug.trim()
      : entry.name
    const name = typeof frontmatter.name === 'string' && frontmatter.name.trim()
      ? frontmatter.name.trim()
      : entry.name
    const description = typeof frontmatter.description === 'string'
      ? frontmatter.description
      : null
    const category = typeof frontmatter.category === 'string' && frontmatter.category.trim()
      ? frontmatter.category.trim()
      : 'general'
    const version = typeof frontmatter.version === 'string' && frontmatter.version.trim()
      ? frontmatter.version.trim()
      : '1.0.0'
    const trustTierParsed = SkillTrustTierSchema.safeParse(frontmatter.trust_tier)
    const capabilityTierParsed = SkillCapabilityTierSchema.safeParse(frontmatter.capability_tier)
    const requiredTools = extractRequiredTools(body)
    const variants = resolveExplicitVariants(frontmatter, requiredTools)

    const skill: SkillPackage = {
      id: `internal:${slug}`,
      slug,
      name,
      description: description ?? undefined,
      category,
      tags: ['internal', 'first-party', category],
      summary: description ?? undefined,
      version,
      trust_tier: trustTierParsed.success ? trustTierParsed.data : 'lucid_first_party',
      capability_tier: capabilityTierParsed.success ? capabilityTierParsed.data : 'tool_backed',
      skill_markdown: raw,
      variants,
      artifact_manifest: {
        entry: 'SKILL.md',
        files,
        checksum,
      },
    }

    return skill
  }))

  return skills.filter((skill): skill is SkillPackage => skill !== null)
}
