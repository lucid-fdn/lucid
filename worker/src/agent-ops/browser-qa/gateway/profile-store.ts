import fs from 'node:fs/promises'
import path from 'node:path'

export type GatewayProfileState = {
  profileArtifactRef?: string
  providerProfileRef?: string
  providerContextRef?: string
  status: 'active' | 'degraded' | 'expired' | 'migration_required' | 'revoked'
}

export class LocalGatewayProfileStore {
  constructor(private readonly rootDir: string) {}

  async readStorageState(profile: GatewayProfileState): Promise<string | undefined> {
    if (profile.status !== 'active') return undefined
    if (!profile.profileArtifactRef) return undefined
    const filePath = this.resolveLocalProfilePath(profile.profileArtifactRef)
    if (!filePath) return undefined
    await fs.access(filePath)
    return filePath
  }

  async writeStorageState(input: {
    orgId?: string
    browserAccountId?: string
    targetId: string
    storageStateJson: string
  }): Promise<string> {
    const safeOrg = safeSegment(input.orgId ?? 'unknown-org')
    const safeAccount = safeSegment(input.browserAccountId ?? 'unknown-account')
    const dir = path.join(this.rootDir, safeOrg, safeAccount)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${safeSegment(input.targetId)}.storage-state.json`)
    await fs.writeFile(filePath, input.storageStateJson, { mode: 0o600 })
    return `local-profile://${safeOrg}/${safeAccount}/${path.basename(filePath)}`
  }

  private resolveLocalProfilePath(profileArtifactRef: string): string | undefined {
    if (!profileArtifactRef.startsWith('local-profile://')) return undefined
    const relative = profileArtifactRef.slice('local-profile://'.length)
    const resolved = path.resolve(this.rootDir, relative)
    const root = path.resolve(this.rootDir)
    if (!resolved.startsWith(root + path.sep)) return undefined
    return resolved
  }
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'unknown'
}
