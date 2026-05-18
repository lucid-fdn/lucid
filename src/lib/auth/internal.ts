function parseEnvList(value: string | undefined): string[] {
  return (value || '').split(',').map((entry) => entry.trim()).filter(Boolean)
}

/**
 * Internal team check — gated by INTERNAL_ORG_IDS env var.
 * Comma-separated list of org UUIDs that get internal-only features.
 */
export function isInternalOrg(orgId: string): boolean {
  const ids = parseEnvList(process.env.INTERNAL_ORG_IDS)
  return ids.includes(orgId)
}

/**
 * Workspace-aware internal check for local/dev surfaces that know the workspace slug.
 * This preserves the UUID-based source of truth while allowing slug-based overrides
 * for local internal workspaces such as `kevinwayne2`.
 */
export function isInternalWorkspace(orgId: string, orgSlug?: string | null): boolean {
  if (isInternalOrg(orgId)) return true

  const internalSlugs = new Set([
    'kevinwayne2',
    ...parseEnvList(process.env.INTERNAL_ORG_SLUGS),
  ])

  return !!orgSlug && internalSlugs.has(orgSlug)
}
