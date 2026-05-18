import type { LucidPackManagedResource, LucidPackManifest } from '@contracts/lucid-pack'
import type { TemplateCapability } from '@contracts/template-composition'
import type { NormalizedCapabilityTemplateComposition } from './types'

export function normalizeCapabilityKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').replace(/-+/g, '-')
}

export function normalizeCapabilityTemplateComposition(manifest: LucidPackManifest): NormalizedCapabilityTemplateComposition {
  const composition = manifest.composition
  return {
    provides: (composition?.provides ?? []).map((capability) => ({
      ...capability,
      key: normalizeCapabilityKey(capability.key),
    })),
    requires: (composition?.requires ?? []).map((dependency) => ({
      ...dependency,
      capability: normalizeCapabilityKey(dependency.capability),
    })),
    optional: (composition?.optional ?? []).map((dependency) => ({
      ...dependency,
      capability: normalizeCapabilityKey(dependency.capability),
    })),
    conflicts: (composition?.conflicts ?? []).map((conflict) => ({
      ...conflict,
      capability: normalizeCapabilityKey(conflict.capability),
    })),
    upgradesFrom: (composition?.upgradesFrom ?? []).map(normalizeCapabilityKey),
    tags: (composition?.tags ?? []).map(normalizeCapabilityKey),
  }
}

export function getExistingResourceCapabilityKeys(resources: LucidPackManagedResource[]): Set<string> {
  const keys = new Set<string>()
  for (const resource of resources) {
    keys.add(normalizeCapabilityKey(resource.resourceKey))
    for (const key of readCapabilityList(resource.metadata.provides)) keys.add(key)
    for (const key of readCapabilityList(resource.metadata.capabilities)) keys.add(key)
    for (const key of readCapabilityList(resource.metadata.capability_keys)) keys.add(key)
  }
  return keys
}

export function capabilityKeysFromManifest(manifest: LucidPackManifest): Set<string> {
  return new Set(normalizeCapabilityTemplateComposition(manifest).provides.map((capability) => capability.key))
}

export function isHighRiskCapability(capability: Pick<TemplateCapability, 'risk'>): boolean {
  return capability.risk === 'high'
}

function readCapabilityList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').map(normalizeCapabilityKey)
}
