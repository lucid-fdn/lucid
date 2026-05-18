import type { LucidPackManifest } from '@contracts/lucid-pack'
import { LucidPackManifestSchema } from '@contracts/lucid-pack'
import { LucidPackManifestSafetyError, assertLucidPackManifestSafe } from '@/lib/packs'
import { isHighRiskCapability, normalizeCapabilityTemplateComposition } from '@/lib/templates/composition'

export interface CapabilityTemplateConformanceIssue {
  code:
    | 'invalid_manifest'
    | 'unsafe_manifest'
    | 'missing_composition'
    | 'missing_provides'
    | 'duplicate_resource_key'
    | 'missing_high_risk_policy'
    | 'missing_trade_policy'
  path: string
  message: string
}

export interface CapabilityTemplateConformanceResult {
  ok: boolean
  issues: CapabilityTemplateConformanceIssue[]
}

export function validateCapabilityTemplateManifest(input: unknown): CapabilityTemplateConformanceResult {
  const parsed = LucidPackManifestSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'invalid_manifest',
        path: issue.path.join('.') || 'manifest',
        message: issue.message,
      })),
    }
  }

  const manifest = parsed.data
  const issues: CapabilityTemplateConformanceIssue[] = []
  try {
    assertLucidPackManifestSafe(manifest)
  } catch (error) {
    if (error instanceof LucidPackManifestSafetyError) {
      issues.push(...error.issues.map((issue) => ({
        code: 'unsafe_manifest' as const,
        path: issue.path,
        message: issue.message,
      })))
    } else {
      throw error
    }
  }

  const composition = normalizeCapabilityTemplateComposition(manifest)
  if (!manifest.composition) {
    issues.push({
      code: 'missing_composition',
      path: 'composition',
      message: 'Capability templates must declare composition metadata.',
    })
  }
  if (composition.provides.length === 0) {
    issues.push({
      code: 'missing_provides',
      path: 'composition.provides',
      message: 'Capability templates must declare at least one provided capability.',
    })
  }

  const seenResourceKeys = new Set<string>()
  for (const [index, resource] of manifest.resources.entries()) {
    if (seenResourceKeys.has(resource.key)) {
      issues.push({
        code: 'duplicate_resource_key',
        path: `resources[${index}].key`,
        message: `Duplicate managed resource key: ${resource.key}`,
      })
    }
    seenResourceKeys.add(resource.key)
  }

  if (composition.provides.some(isHighRiskCapability) && !hasApprovalPolicy(manifest)) {
    issues.push({
      code: 'missing_high_risk_policy',
      path: 'resources',
      message: 'High-risk capabilities must ship with an explicit approval policy resource.',
    })
  }
  if (composition.provides.some((capability) => capability.kind === 'web3_trade') && !hasApprovalPolicy(manifest)) {
    issues.push({
      code: 'missing_trade_policy',
      path: 'resources',
      message: 'Web3 trading or automation capabilities must ship with an explicit review or approval policy resource.',
    })
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}

function hasApprovalPolicy(manifest: LucidPackManifest): boolean {
  return manifest.resources.some((resource) => (
    resource.kind === 'policy'
    && (
      resource.spec.approval_required === true
      || resource.spec.requires_approval === true
      || resource.spec.high_risk_approval === true
      || resource.spec.policy_type === 'approval'
    )
  ))
}
